
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: files, isLoading } = useQuery<FileUpload[]>({
    queryKey: ["/api/files"],
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
      setSelectedStudentId("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to upload file",
        variant: "destructive",
      });
    },
  });

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !selectedStudentId) return;

    const formData = new FormData();
    formData.append("title", title);
    formData.append("file", file);
    formData.append("studentId", selectedStudentId);

    uploadMutation.mutate(formData);
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
            <Select
              value={selectedStudentId}
              onValueChange={setSelectedStudentId}
            >
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
                <h3 className="font-semibold">{file.title}</h3>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
