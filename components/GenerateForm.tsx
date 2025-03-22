"use client";

import { Loader2, VideoIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import MaxWidthWrapper from "./common/MaxWidthWrapper";
import { Card } from "./ui/card";
import { CreatePowerpoint } from "@/app/generate/actions";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

type Template = {
  name: string;
  displayName: string;
};

const templates: Template[] = [
  { name: "Ion_Boardroom", displayName: "Ion Boardroom" },
  { name: "Blank", displayName: "Blank" },
];

export default function GenerateForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [topic, setTopic] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("Blank");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTopic(e.target.value);
    setError(null); // Clear error when user starts typing
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTemplate(e.target.value);
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter a valid topic");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await CreatePowerpoint(topic, selectedTemplate);
      if (result.success) {
        toast({
          title: "Presentation Created",
          description: "Your presentation has been successfully created.",
          variant: "default",
        });
        router.push(`/dashboard`);
      } else {
        toast({
          title: "Something went wrong",
          description: "Please try again later",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Something went wrong",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-100 py-12">
      <MaxWidthWrapper>
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
            Create beautiful presentations{" "}
            <span className="block text-lg font-normal text-gray-600 mt-2">
              Enter a topic to generate a professional PowerPoint
            </span>
          </h1>
          <Card className="p-8 shadow-xl bg-white/80 backdrop-blur-sm border-0">
            <div className="mb-8 aspect-video bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl flex flex-col items-center justify-center text-slate-500 shadow-inner">
              <VideoIcon className="w-16 h-16 mb-4 text-slate-500" />
              <p>Enter a topic to get started.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Input
                type="text"
                placeholder="Enter presentation topic"
                value={topic}
                onChange={handleTopicChange}
                className="flex-1 h-12 px-4 rounded-xl border-slate-200 focus:border-violet-500 focus:ring-violet-500"
                disabled={isLoading}
                aria-label="Presentation Topic"
              />
              <div className="flex flex-col">
                <label htmlFor="template-select" className="mb-2 text-sm text-gray-600">
                  Select Template:
                </label>
                <select
                  id="template-select"
                  value={selectedTemplate}
                  onChange={handleTemplateChange}
                  className="h-12 px-4 rounded-xl border-slate-200 focus:border-violet-500 focus:ring-violet-500"
                  disabled={isLoading}
                >
                  {templates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={!topic.trim() || isLoading}
                className="h-12 px-6"
                onClick={handleGenerate}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating a presentation
                  </>
                ) : (
                  "Create presentation"
                )}
              </Button>
            </div>
            {error && <p className="text-red-500 mt-2">{error}</p>}
            <p className="text-center text-sm text-slate-500 mt-4">
              Just enter a topic and we will generate a presentation for you.
            </p>
          </Card>
        </div>
      </MaxWidthWrapper>
    </div>
  );
}