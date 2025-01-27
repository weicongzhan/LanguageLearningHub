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
import { Loader2, Plus, Pencil, Volume2 } from "lucide-react";
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
  const [selectedFlashcard, setSelectedFlashcard] = useState<Flashcard | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lessons, isLoading } = useQuery<LessonWithFlashcards[]>({
    queryKey: ["/api/lessons"],
  });

  const lessonForm = useForm<LessonFormData>();
  const flashcardForm = useForm<FlashcardFormData>();

  // Create lesson mutation
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

  // Create/Update flashcard mutation
  const flashcardMutation = useMutation({
    mutationFn: async ({ data, isEdit = false }: { data: FlashcardFormData, isEdit?: boolean }) => {
      if (!selectedLesson) throw new Error("No lesson selected");

      const formData = new FormData();
      formData.append("lessonId", selectedLesson.id.toString());

      if (data.audio[0]) {
        formData.append("audio", data.audio[0]);
      }

      if (data.images.length > 0) {
        for (let i = 0; i < data.images.length; i++) {
          formData.append("images", data.images[i]);
        }
      }

      formData.append("correctImageIndex", data.correctIndex);

      if (isEdit && selectedFlashcard) {
        formData.append("flashcardId", selectedFlashcard.id.toString());
      }

      const response = await fetch("/api/flashcards", {
        method: isEdit ? "PUT" : "POST",
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
      toast({ title: selectedFlashcard ? "Flashcard updated successfully" : "Flashcard created successfully" });
      flashcardForm.reset();
      setSelectedFlashcard(null);
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

  const handleFlashcardSubmit = async (data: FlashcardFormData) => {
    if (!selectedLesson) return;

    const isEdit = !!selectedFlashcard;

    // For new flashcards, require audio and images
    if (!isEdit) {
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
    }

    if (!data.correctIndex && !isEdit) {
      return toast({
        variant: "destructive",
        title: "Correct answer required",
        description: "Please select the correct image",
      });
    }

    try {
      await flashcardMutation.mutateAsync({ data, isEdit });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: isEdit ? "Error updating flashcard" : "Error creating flashcard",
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
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Flashcards ({lesson.flashcards?.length || 0})</h3>
                    {lesson.flashcards?.map((flashcard) => (
                      <div key={flashcard.id} className="mb-4 p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <audio src={flashcard.audioUrl} controls className="w-48" />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedLesson(lesson);
                              setSelectedFlashcard(flashcard);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(flashcard.imageChoices as string[]).map((url, idx) => (
                            <div key={idx} className={`relative border rounded p-1 ${idx === flashcard.correctImageIndex ? 'ring-2 ring-green-500' : ''}`}>
                              <img src={url} alt={`Choice ${idx + 1}`} className="w-full h-24 object-cover rounded" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedLesson(lesson);
                          setSelectedFlashcard(null);
                        }}
                      >
                        Add Flashcard
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {selectedFlashcard ? "Edit Flashcard" : "Add Flashcard"} - {lesson.title}
                        </DialogTitle>
                      </DialogHeader>
                      <form
                        onSubmit={flashcardForm.handleSubmit(handleFlashcardSubmit)}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label>Audio Recording {selectedFlashcard ? "(optional)" : "(required)"}</Label>
                          <Input
                            type="file"
                            accept="audio/*"
                            {...flashcardForm.register("audio", { required: !selectedFlashcard })}
                          />
                          {selectedFlashcard && (
                            <div className="mt-2">
                              <Label>Current Audio:</Label>
                              <audio src={selectedFlashcard.audioUrl} controls className="mt-1 w-full" />
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Images {selectedFlashcard ? "(optional)" : "(at least 2 required)"}</Label>
                          <Input
                            type="file"
                            accept="image/*"
                            multiple
                            {...flashcardForm.register("images", { required: !selectedFlashcard })}
                          />
                          {selectedFlashcard && (
                            <div className="mt-2">
                              <Label>Current Images:</Label>
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                {(selectedFlashcard.imageChoices as string[]).map((url, idx) => (
                                  <div key={idx} className={`relative border rounded p-1 ${idx === selectedFlashcard.correctImageIndex ? 'ring-2 ring-green-500' : ''}`}>
                                    <img src={url} alt={`Choice ${idx + 1}`} className="w-full h-24 object-cover rounded" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Select Correct Image</Label>
                          <RadioGroup 
                            onValueChange={(value) => flashcardForm.setValue("correctIndex", value)}
                            defaultValue={selectedFlashcard ? String(selectedFlashcard.correctImageIndex) : undefined}
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
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="3" id="image-3" />
                              <Label htmlFor="image-3">Fourth Image</Label>
                            </div>
                          </RadioGroup>
                        </div>

                        <Button
                          type="submit"
                          disabled={flashcardMutation.isPending}
                        >
                          {flashcardMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {selectedFlashcard ? "Update" : "Add"} Flashcard
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
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