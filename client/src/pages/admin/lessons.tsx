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
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Trash } from "lucide-react";
import type { Lesson, Flashcard } from "@db/schema";

type LessonFormData = {
  title: string;
  description: string;
  language: string;
};

type FlashcardFormData = {
  front: string;
  back: string;
  audio: FileList;
};

export default function AdminLessons() {
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lessons, isLoading } = useQuery<Lesson[]>({
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
      const formData = new FormData();
      formData.append("front", data.front);
      formData.append("back", data.back);
      formData.append("lessonId", selectedLesson!.id.toString());
      if (data.audio[0]) {
        formData.append("audio", data.audio[0]);
      }

      const response = await fetch("/api/flashcards", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(await response.text());
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
                      <Input
                        placeholder="Front Text"
                        {...flashcardForm.register("front", { required: true })}
                      />
                      <Input
                        placeholder="Back Text"
                        {...flashcardForm.register("back", { required: true })}
                      />
                      <Input
                        type="file"
                        accept="audio/*"
                        {...flashcardForm.register("audio")}
                      />
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
        </div>
      )}
    </div>
  );
}
