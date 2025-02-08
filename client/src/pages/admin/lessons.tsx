import { useState, useEffect } from "react";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Pencil, Volume2, Upload } from "lucide-react";
import type { Lesson, Flashcard } from "@db/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CSVReader } from "@/components/CSVReader";

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

type User = {
  id: number;
  username: string;
  isAdmin: boolean;
};

export default function AdminLessons() {
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedFlashcard, setSelectedFlashcard] = useState<Flashcard | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lessons, isLoading } = useQuery<LessonWithFlashcards[]>({
    queryKey: ["/api/lessons"],
  });

  const { data: studentsData } = useQuery<User[]>({
    queryKey: ["/api/students"],
  });

  // 使用 useEffect 来更新 students 状态
  useEffect(() => {
    if (studentsData) {
      setStudents(studentsData);
    }
  }, [studentsData]);


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

      // Step 1: Initialize flashcard creation
      const initResponse = await fetch("/api/flashcards/init", {
        method: "POST",
        credentials: 'include'
      });

      if (!initResponse.ok) {
        throw new Error(await initResponse.text());
      }

      const { flashcardId } = await initResponse.json();

      // Step 2: Upload files
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

      const uploadResponse = await fetch(`/api/flashcards/${flashcardId}/upload`, {
        method: "POST",
        body: formData,
        credentials: 'include'
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(errorText);
      }

      return uploadResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      toast({ title: selectedFlashcard ? "Flashcard updated successfully" : "Flashcard created successfully" });
      flashcardForm.reset();
      setSelectedFlashcard(null);
    },
  });

  // Delete flashcard mutation
  const deleteFlashcardMutation = useMutation({
    mutationFn: async (flashcardId: number) => {
      const response = await fetch(`/api/flashcards/${flashcardId}`, {
        method: "DELETE",
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
      toast({ title: "Flashcard deleted successfully" });
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

  const handleDeleteFlashcard = async (flashcard: Flashcard) => {
    try {
      await deleteFlashcardMutation.mutateAsync(flashcard.id);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error deleting flashcard",
        description: error.message,
      });
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Lessons Management</h1>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                批量导入闪卡
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>批量导入闪卡</DialogTitle>
                <DialogDescription>
                  请上传CSV文件。文件应包含以下列：lessonId, audioUrl, imageChoices, correctImageIndex
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const file = formData.get('file') as File;

                if (!file) {
                  toast({
                    variant: "destructive",
                    title: "错误",
                    description: "请选择一个CSV文件"
                  });
                  return;
                }

                try {
                  const formData = new FormData();
                  formData.append('file', file);

                  const response = await fetch('/api/flashcards/bulk-import', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include'
                  });

                  if (!response.ok) {
                    throw new Error(await response.text());
                  }

                  const result = await response.json();

                  toast({
                    title: "导入成功",
                    description: `成功导入 ${result.imported} 个闪卡`
                  });

                  queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
                } catch (error: any) {
                  toast({
                    variant: "destructive",
                    title: "导入失败",
                    description: error.message
                  });
                }
              }} className="space-y-4">
                <div className="space-y-2">
                  <Label>CSV文件</Label>
                  <Input
                    type="file"
                    name="file"
                    accept=".csv"
                    required
                  />
                </div>
                <Button type="submit">
                  导入
                </Button>
              </form>
            </DialogContent>
          </Dialog>
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
      </div>

      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lessons?.map((lesson) => (
            <Card key={lesson.id}>
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
                          <div className="flex gap-2">
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
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteFlashcard(flashcard)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid grid-cols-2 gap-2">
                          {(flashcard.imageChoices as string[]).map((url, idx) => (
                            <div key={idx} className={`relative border rounded p-1 ${idx === flashcard.correctImageIndex ? 'ring-2 ring-green-500' : ''}`}>
                              <div className="aspect-square relative">
                                <img 
                                  src={url} 
                                  alt={`Choice ${idx + 1}`} 
                                  className="absolute inset-0 w-full h-full object-contain"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
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
                                    <img src={url} alt={`Choice ${idx + 1}`} className="w-[338px] h-[334px] object-cover rounded" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Select Correct Image</Label>
                          {selectedFlashcard ? (
                            <RadioGroup
                              onValueChange={(value) => flashcardForm.setValue("correctIndex", value)}
                              defaultValue={String(selectedFlashcard.correctImageIndex)}
                              className="flex flex-col space-y-2"
                            >
                              {(selectedFlashcard.imageChoices as string[]).map((url, idx) => (
                                <div key={idx} className="flex items-center space-x-2">
                                  <RadioGroupItem value={String(idx)} id={`image-${idx}`} />
                                  <Label htmlFor={`image-${idx}`}>
                                    {url.split('/').pop()?.split('-').slice(2).join('-') || `Image ${idx + 1}`}
                                  </Label>
                                </div>
                              ))}
                            </RadioGroup>
                          ) : (
                            <RadioGroup
                              onValueChange={(value) => flashcardForm.setValue("correctIndex", value)}
                              className="flex flex-col space-y-2"
                            >
                              {Array.from(flashcardForm.watch("images") || []).map((file: File, idx) => (
                                <div key={idx} className="flex items-center space-x-2">
                                  <RadioGroupItem value={String(idx)} id={`image-${idx}`} />
                                  <Label htmlFor={`image-${idx}`}>{file.name}</Label>
                                </div>
                              ))}
                            </RadioGroup>
                          )}
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
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="ml-2">
                        Assign to Students
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Assign Lesson to Students</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const studentId = formData.get('studentId');

                        if (!studentId || !lesson.id) return;

                        try {
                          const response = await fetch('/api/user-lessons', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              userId: parseInt(studentId as string),
                              lessonId: lesson.id
                            }),
                            credentials: 'include'
                          });

                          if (!response.ok) {
                            throw new Error(await response.text());
                          }

                          toast({
                            title: "Success",
                            description: "Lesson assigned successfully"
                          });
                        } catch (error: any) {
                          toast({
                            variant: "destructive",
                            title: "Error",
                            description: error.message
                          });
                        }
                      }} className="space-y-4">
                        <div className="space-y-2">
                          <Label>Select Student</Label>
                          <Select name="studentId" required>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a student" />
                            </SelectTrigger>
                            <SelectContent>
                              {students?.map((student) => (
                                <SelectItem key={student.id} value={student.id.toString()}>
                                  {student.username}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="submit">
                          Assign Lesson
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