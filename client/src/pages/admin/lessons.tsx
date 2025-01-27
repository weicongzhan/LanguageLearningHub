import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Loader2, Plus } from "lucide-react";
import type { Lesson, Flashcard } from "@db/schema";

type LessonFormData = {
  title: string;
  description: string;
  language: string;
};

type FlashcardFormData = {
  audio: FileList;
  images: FileList;
  correctIndex: string;
};

type LessonWithFlashcards = Lesson & {
  flashcards: Flashcard[];
};

export default function AdminLessons() {
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lessons, isLoading } = useQuery<LessonWithFlashcards[]>({
    queryKey: ["/api/lessons"],
  });

  const lessonForm = useForm<LessonFormData>();
  const flashcardForm = useForm<FlashcardFormData>();

  const createLessonMutation = useMutation({
    mutationFn: async (data: LessonFormData) => {
      const response = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: 'include'
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      toast({ title: "Lesson created successfully" });
      lessonForm.reset();
    },
  });

  const createFlashcardMutation = useMutation({
    mutationFn: async (data: FlashcardFormData) => {
      if (!selectedLesson) throw new Error("No lesson selected");

      const formData = new FormData();
      formData.append("lessonId", selectedLesson.id.toString());

      if (data.audio[0]) {
        formData.append("audio", data.audio[0]);
      }

      for (let i = 0; i < data.images.length; i++) {
        formData.append("images", data.images[i]);
      }

      formData.append("correctImageIndex", data.correctIndex);

      const response = await fetch("/api/flashcards", {
        method: "POST",
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      toast({ title: "Flashcard created successfully" });
      flashcardForm.reset();
    },
  });

  const handleCreateLesson = async (data: LessonFormData) => {
    try {
      await createLessonMutation.mutateAsync(data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error creating lesson",
        description: error.message,
      });
    }
  };

  const handleCreateFlashcard = async (data: FlashcardFormData) => {
    if (!selectedLesson) return;
    if (!data.audio?.length) {
      return toast({
        variant: "destructive",
        title: "Audio required",
        description: "Please upload an audio file",
      });
    }
    if (!data.images?.length) {
      return toast({
        variant: "destructive",
        title: "Images required",
        description: "Please upload at least 2 images",
      });
    }
    if (!data.correctIndex) {
      return toast({
        variant: "destructive",
        title: "Correct answer required",
        description: "Please select the correct image",
      });
    }
    try {
      await createFlashcardMutation.mutateAsync(data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error creating flashcard",
        description: error.message,
      });
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Lessons Management</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Lesson
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Lesson</DialogTitle>
            </DialogHeader>
            <form onSubmit={lessonForm.handleSubmit(handleCreateLesson)} className="space-y-4">
              <Input
                placeholder="Lesson Title"
                {...lessonForm.register("title", { required: true })}
              />
              <Textarea
                placeholder="Lesson Description"
                {...lessonForm.register("description")}
              />
              <Input
                placeholder="Language"
                {...lessonForm.register("language", { required: true })}
              />
              <Button type="submit" disabled={createLessonMutation.isPending}>
                {createLessonMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Lesson
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lessons?.map((lesson) => (
            <Card key={lesson.id} className="relative">
              <CardHeader>
                <CardTitle>{lesson.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {lesson.description}
                </p>
                <p className="text-sm font-medium mb-4">
                  Language: {lesson.language}
                </p>
                <p className="text-sm font-medium mb-4">
                  Flashcards: {lesson.flashcards?.length || 0}
                </p>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedLesson(lesson)}
                    >
                      Add Flashcard
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Flashcard to {lesson.title}</DialogTitle>
                    </DialogHeader>
                    <form
                      onSubmit={flashcardForm.handleSubmit(handleCreateFlashcard)}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label>Audio Recording (required)</Label>
                        <Input
                          type="file"
                          accept="audio/*"
                          {...flashcardForm.register("audio", { required: true })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Images (at least 2)</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          multiple
                          {...flashcardForm.register("images", { required: true })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Select Correct Image</Label>
                        <RadioGroup 
                          onValueChange={(value) => flashcardForm.setValue("correctIndex", value)}
                          className="flex flex-col space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="0" id="image-0" />
                            <Label htmlFor="image-0">First Image</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="1" id="image-1" />
                            <Label htmlFor="image-1">Second Image</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="2" id="image-2" />
                            <Label htmlFor="image-2">Third Image</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <Button
                        type="submit"
                        disabled={createFlashcardMutation.isPending}
                      >
                        {createFlashcardMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Add Flashcard
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))}
          {(!lessons || lessons.length === 0) && (
            <p className="text-muted-foreground col-span-full text-center">
              No lessons available. Create your first lesson to get started.
            </p>
          )}
        </div>
      )}
    </div>
  );
}