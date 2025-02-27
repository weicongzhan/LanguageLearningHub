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
import { Loader2, Plus, Pencil, Volume2, Upload, ChevronDown } from "lucide-react";
import type { Lesson, Flashcard } from "@db/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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

  // Add deleteLessonMutation after other mutations
  const deleteLessonMutation = useMutation({
    mutationFn: async (lessonId: number) => {
      const response = await fetch(`/api/lessons/${lessonId}`, {
        method: "DELETE",
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      toast({ title: "课程删除成功" });
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

  const handleDeleteLesson = async (lessonId: number) => {
    try {
      await deleteLessonMutation.mutateAsync(lessonId);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "删除课程失败",
        description: error.message,
      });
    }
  };

  const handleBulkUpload = async (files: FileList, title: string, description?: string) => {
    const formData = new FormData();
    formData.append('title', title);
    if (description) {
      formData.append('description', description);
    }
    for (let i = 0; i < files.length; i++) {
      formData.append('file', files[i]);
    }

    try {
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
                <DialogTitle>批量上传闪卡</DialogTitle>
                <DialogDescription>
                  请选择包含音频和图片的文件夹。图片和对应的音频文件名需要相同。
                  系统会自动为每个音频匹配对应图片，并随机选择3张其他图片作为选项。
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const fileInput = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement;
                const files = fileInput.files;
                const title = formData.get('title') as string;
                const description = formData.get('description') as string;

                if (!files || files.length === 0 || !title) {
                  toast({
                    variant: "destructive",
                    title: "错误",
                    description: "请选择文件和课程标题"
                  });
                  return;
                }

                const uploadFormData = new FormData();
                uploadFormData.append('title', title);
                if (description) {
                  uploadFormData.append('description', description);
                }

                for (let i = 0; i < files.length; i++) {
                  uploadFormData.append('files', files[i]);
                }

                try {
                  const response = await fetch('/api/flashcards/bulk-import', {
                    method: 'POST',
                    body: uploadFormData,
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
                <div>
                  <Label htmlFor="title">课程标题</Label>
                  <Input
                    id="title"
                    name="title"
                    type="text"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="description">课程描述（可选）</Label>
                  <Textarea
                    id="description"
                    name="description"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="files">选择文件</Label>
                  <Input
                    id="files"
                    name="files"
                    type="file"
                    multiple
                    required
                    className="mt-1"
                  />
                </div>
                <Button type="submit">上传</Button>
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
                <div className="flex justify-between items-center">
                  <CardTitle>{lesson.title}</CardTitle>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteLesson(lesson.id)}
                    disabled={deleteLessonMutation.isPending}
                  >
                    {deleteLessonMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    删除课程
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {lesson.description}
                </p>
                <p className="text-sm font-medium mb-4">
                  Language: {lesson.language}
                </p>
                <div className="space-y-4">
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value={`flashcards-${lesson.id}`}>
                      <AccordionTrigger className="text-sm font-medium">
                        Flashcards ({lesson.flashcards?.length || 0})
                      </AccordionTrigger>
                      <AccordionContent>
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
                            <div className="grid grid-cols-2 gap-1">
                              <div className="grid grid-cols-2 gap-1">
                                {(flashcard.imageChoices as string[]).map((url, idx) => (
                                  <div key={idx} className={`relative border rounded p-0.5 ${idx === flashcard.correctImageIndex ? 'ring-2 ring-green-500' : ''}`}>
                                    <div className="aspect-square relative max-w-[100px] mx-auto">
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
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
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
                              <div className="grid grid-cols-2 gap-1 mt-1">
                                {(selectedFlashcard.imageChoices as string[]).map((url, idx) => (
                                  <div key={idx} className={`relative border rounded p-0.5 ${idx === selectedFlashcard.correctImageIndex ? 'ring-2 ring-green-500' : ''}`}>
                                    <div className="aspect-square relative max-w-[100px] mx-auto">
                                      <img src={url} alt={`Choice ${idx + 1}`} className="absolute inset-0 w-full h-full object-contain" />
                                    </div>
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
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>搜索并选择学生</Label>
                            <Select name="studentId" required>
                              <SelectTrigger>
                                <SelectValue placeholder="输入搜索或选择学生" />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="p-2">
                                  <Input 
                                    type="text" 
                                    placeholder="搜索学生..."
                                    onChange={(e) => {
                                      const searchTerm = e.target.value.toLowerCase();
                                      const filtered = studentsData?.filter(student => 
                                        student.username.toLowerCase().includes(searchTerm)
                                      ) || [];
                                      setStudents(filtered);
                                    }}
                                  />
                                </div>
                                <div className="max-h-[200px] overflow-auto">
                                  {students?.map((student) => (
                                    <SelectItem key={student.id} value={student.id.toString()}>
                                      {student.username}
                                    </SelectItem>
                                  ))}
                                </div>
                              </SelectContent>
                            </Select>
                          </div>
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