import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Upload, User, UserPlus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type FileUpload = {
  id: number;
  title: string;
  type: "audio" | "image" | "video";
  url: string;
  assignedStudents: number[];
  createdAt: string;
};

type Student = {
  id: number;
  username: string;
};

export default function FilesPage() {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: files, isLoading } = useQuery<FileUpload[]>({
    queryKey: ["/api/files"],
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
    networkMode: 'always',
    queryFn: async () => {
      const response = await fetch("/api/files", {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      return response.json();
    }
  });

  const { data: students } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
      setTitle("");
      setFile(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to upload file",
        variant: "destructive",
      });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ fileId, studentId }: { fileId: number; studentId: number }) => {
      const response = await fetch(`/api/files/${fileId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ studentId }),
      });
      if (!response.ok) {
        throw new Error("Assignment failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      toast({
        title: "Success",
        description: "File assigned successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to assign file",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: number) => {
      try {
        const response = await fetch(`/api/files/${fileId}`, {
          method: "DELETE",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",  // 禁用缓存
            "Pragma": "no-cache"
          },
          credentials: 'include',
        });
        
        // 如果状态码是 304，视为成功
        if (response.status === 304) {
          return {
            success: true,
            message: "文件删除成功"
          };
        }

        let responseData;
        const text = await response.text();
        console.log('Raw server response:', text, 'Status:', response.status);
        
        // 如果响应为空但状态码是 200，视为成功
        if (!text && response.status === 200) {
          return {
            success: true,
            message: "文件删除成功"
          };
        }

        try {
          responseData = text ? JSON.parse(text) : {
            success: response.ok,
            message: response.ok ? "文件删除成功" : "删除失败"
          };
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          // 如果状态码是成功的，即使解析失败也视为成功
          if (response.ok) {
            return {
              success: true,
              message: "文件删除成功"
            };
          }
          throw new Error('服务器响应格式错误');
        }

        if (!response.ok || !responseData.success) {
          console.error('Server error response:', responseData);
          throw new Error(responseData.error || responseData.details || '删除失败');
        }

        return responseData;
      } catch (error) {
        console.error('Delete request error:', error);
        throw error;
      }
    },
    onMutate: (fileId) => {
      // 乐观更新：立即从UI中移除文件
      const previousFiles = queryClient.getQueryData<FileUpload[]>(["/api/files"]);
      if (previousFiles) {
        queryClient.setQueryData<FileUpload[]>(["/api/files"], 
          previousFiles.filter(f => f.id !== fileId)
        );
      }
      return { previousFiles };
    },
    onError: (error: Error, fileId, context) => {
      // 发生错误时恢复之前的数据
      if (context?.previousFiles) {
        queryClient.setQueryData(["/api/files"], context.previousFiles);
      }
      const deletedFile = files?.find(f => f.id === fileId);
      console.error('Delete mutation error:', error);
      toast({
        title: "删除失败",
        description: `删除文件 "${deletedFile?.title || ''}" 失败: ${error.message}`,
        variant: "destructive",
        duration: 5000,
      });
    },
    onSuccess: (data, fileId) => {
      const deletedFile = files?.find(f => f.id === fileId);
      toast({
        title: "删除成功",
        description: `文件 "${deletedFile?.title || ''}" 已成功删除`,
        duration: 3000,
      });
      // 强制刷新文件列表
      queryClient.invalidateQueries({ 
        queryKey: ["/api/files"],
        exact: true
      });
    },
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) {
      toast({
        title: "Error",
        description: "Please provide both file and title",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("file", file);

    uploadMutation.mutate(formData);
  };

  const handleAssign = (fileId: number, studentId: string) => {
    assignMutation.mutate({ fileId, studentId: parseInt(studentId) });
  };

  const handleDelete = async (fileId: number) => {
    try {
      // 检查文件是否有分配给学生
      const file = files?.find(f => f.id === fileId);
      if (file?.assignedStudents.length) {
        toast({
          title: "警告",
          description: `此文件已分配给 ${file.assignedStudents.length} 个学生。删除文件将影响这些学生的学习。`,
          variant: "destructive",
          duration: 5000,
        });
      }
      deleteMutation.mutate(fileId);
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "错误",
        description: "删除文件时发生错误，请稍后重试",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">File Management</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload New File</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <Input
              placeholder="File Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <Input
              type="file"
              accept="audio/*,video/*,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
            <Button disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload File
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {files?.map((file) => (
            <Card key={file.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold">{file.title}</h3>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={deleteMutation.isPending}>
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>删除文件</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                          <p>确定要删除文件 "{file.title}" 吗？此操作无法撤销。</p>
                          {file.assignedStudents.length > 0 && (
                            <p className="text-destructive">
                              警告：此文件已分配给 {file.assignedStudents.length} 个学生。
                              删除文件将影响这些学生的学习。
                            </p>
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(file.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              删除中...
                            </>
                          ) : (
                            "删除"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <p className="text-sm text-gray-500">{file.type}</p>
                <p className="text-sm text-gray-500">
                  Uploaded: {new Date(file.createdAt).toLocaleDateString()}
                </p>
                {file.assignedStudents.length > 0 && (
                  <div className="flex items-center gap-1 mt-2 text-sm text-gray-500">
                    <User className="h-4 w-4" />
                    <span>Assigned to {file.assignedStudents.length} student(s)</span>
                  </div>
                )}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full mt-2">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Assign to Student
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Assign File to Student</DialogTitle>
                    </DialogHeader>
                    <Select onValueChange={(value) => handleAssign(file.id, value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Student" />
                      </SelectTrigger>
                      <SelectContent>
                        {students?.map((student) => (
                          <SelectItem key={student.id} value={student.id.toString()}>
                            {student.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
