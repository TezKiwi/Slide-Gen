"use server";
import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import axios from "axios";
import { DOMParser } from "xmldom";
import { z } from "zod";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import pptxgen from "pptxgenjs";
import { randomUUID } from "crypto";
import path from "path";
import type { UploadFileResult } from "uploadthing/types";
import { UTApi } from "uploadthing/server";
import fs from "fs";

const CURRENT_MODEL = "gpt-4o-mini";
const DEFAULT_SLIDE_COUNT = 10;

const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN!,
});

const openai = new OpenAI({
  apiKey: process.env.OPEN_API_KEY,
});

type SlideContent = {
  title: string;
  content: string[];
};

type VideoMetaData = {
  length: number | null;
  subtitlesURL: string | null;
};

type SubtitleItem = {
  text: string;
  start: number;
  dur: number;
};


const TitleAndDescriptionSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const arrayOfObjectsSchema = z.object({
  arrayOfObjects: z.array(
    z.object({
      title: z.string(),
      content: z.array(z.string()),
    })
  ),
});

type TitleDescription = z.infer<typeof TitleAndDescriptionSchema>;

export async function CreatePowerpoint(topic: string) {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    if (!user || !user.id) {
      return {
        success: false,
      };
    }
    const dbUser = await db.user.findFirst({
      where: {
        id: user.id,
      },
    });

    if (!dbUser) {
      return {
        success: false,
      };
    }

    const [titleAndDescription, slideObjects] = await Promise.all([
      CreateTitleAndDescription(topic), // Pass topic instead of fullText
      ConvertToObjects(topic), // Pass topic instead of fullText
    ]);

    if (!slideObjects) {
      throw new Error("Failed to convert to objects");
    }

    const { fileName, filePath } = await CreatePowerpointFromArrayOfObjects(
      titleAndDescription,
      slideObjects,
      user.id
    );

    const fileBuffer = await fs.promises.readFile(filePath);
    const UploadResult = await UploadPowerpointToUploadThing(
      fileBuffer,
      fileName
    );

    if (!UploadResult[0].data?.url) {
      throw new Error("Upload failed - No URL returned");
    }

    await db.generatedPowerpoints.create({
      data: {
        link: UploadResult[0].data?.url,
        ownerId: user.id,
        title: titleAndDescription.title,
        description: titleAndDescription.description,
      },
    });

    await fs.promises.unlink(filePath);

    return {
      success: true,
    };
  } catch (error) {
    console.error(error);
    throw new Error("Failed to create powerpoint");
  }
}


async function parseXMLContent( // Removed export
  url: string
): Promise<SubtitleItem[] | null> {
  try {
    const response = await axios.get(url);
    const parser = new DOMParser();
    const doc = parser.parseFromString(response.data, "application/xml");
    const textElements = doc.getElementsByTagName("text");

    return Array.from(textElements).map((element) => ({
      text: element.textContent || "",
      start: parseFloat(element.getAttribute('start') || '0'),
      dur: parseFloat(element.getAttribute('dur') || '0')
    }));
  } catch (error) {
    console.error(error);
    throw new Error("Something went wrong");
  }
}

export async function CreateTitleAndDescription(
  topic: string // Changed parameter to topic
): Promise<TitleDescription> {
  const promptTemplate = `Generate a title and description for this Powerpoint presentation based on the following topic. 
    Requirements: 
    - Title should be fewer than 20 words 
    - description should be fewer than 35 words 
    - Focus on content rather than speaker 
    - make sure the output is in English 

    Topic: ${topic} 
    `;

  try {
    const completion = await openai.beta.chat.completions.parse({
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant designed to generate titles and descriptions",
        },
        {
          role: "user",
          content: promptTemplate,
        },
      ],
      model: CURRENT_MODEL,
      response_format: zodResponseFormat(TitleAndDescriptionSchema, "title"),
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("Failed to generate title and description");
    }

    return result;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to generate title and description");
  }
}

export async function ConvertToObjects(
  topic: string, // Changed parameter to topic - added comma
  slideCount = DEFAULT_SLIDE_COUNT
): Promise<SlideContent[] | null> {
  const promptTemplate = `Condense and tidy up the following text to make it suitable for a Powerpoint presentation based on the topic. Transform it
        into an array of objects. I have provided the schema for the output. Make sure that the content array has between 3 and 4 items, 
        and each content string should be between 160 and 170 characters. You can add to the content based on the topic. 
        The length of the array should be ${slideCount}.
        The topic to process is as follows: ${topic}
    `;

  try {
    const completion = await openai.beta.chat.completions.parse({
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant designed to convert text into objects. You output JSON based on a schema I provide.",
        },
        {
          role: "user",
          content: promptTemplate,
        },
      ],
      model: CURRENT_MODEL,
      response_format: zodResponseFormat(
        arrayOfObjectsSchema,
        "arrayOfObjects"
      ),
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("Failed to convert to objects");
    }

    return result.arrayOfObjects;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to convert to objects");
  }
}

export async function CreatePowerpointFromArrayOfObjects(
  titleAndDescription: TitleDescription,
  slides: SlideContent[],
  userId: string
) {
  const pptx = new pptxgen();

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: "#FFFFFF" };

  titleSlide.addText(titleAndDescription.title, {
    x: 0,
    y: "40%",
    w: "100%",
    h: 1,
    fontSize: 33,
    bold: true,
    color: "003366",
    align: "center",
    fontFace: "Helvetica",
  });

  titleSlide.addText(titleAndDescription.description, {
    x: 0,
    y: "58%",
    w: "100%",
    h: 0.75,
    fontSize: 18,
    color: "888888",
    align: "center",
    fontFace: "Helvetica",
  });

  slides.forEach(({ title, content }) => {
    const slide = pptx.addSlide();
    slide.addText(title, {
      x: 0.5,
      y: 0.5,
      w: 8.5,
      h: 1,
      fontSize: 32,
      bold: true,
      color: "003366",
      align: "center",
      fontFace: "Arial",
    });

    content.forEach((bullet, index) => {
      slide.addText(bullet, {
        x: 1,
        y: 1.8 + index * 1,
        w: 8,
        h: 0.75,
        fontSize: 15,
        color: "333333",
        align: "left",
        fontFace: "Arial",
        bullet: true,
      });
    });
  });

  try {
    const fileName = `presentation-${randomUUID()}-userId=${userId}.pptx`;
    const filePath = path.join("/tmp", fileName);

    await pptx.writeFile({ fileName: filePath });

    return {
      fileName,
      filePath,
    };
  } catch (error) {
    console.error(error);
    throw new Error("Failed to create powerpoint");
  }
}


async function UploadPowerpointToUploadThing( // Removed export
  fileBuffer: Buffer,
  fileName: string
): Promise<UploadFileResult[]> {
  try {
    const file = new File([fileBuffer], fileName, {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const response = await utapi.uploadFiles([file]);

    if (!response?.[0].data?.url) {
      throw new Error("Upload failed - No URL returned");
    }

    return response;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to upload powerpoint to uploadthing");
  }
}
