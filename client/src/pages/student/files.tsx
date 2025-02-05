
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileIcon } from "lucide-react";

type File = {
  id: number;
  title: string;
  type: string;
  url: string;
  createdAt: string;
};

export default function StudentFiles() {
  const { data: files, isLoading } = useQuery<File[]>({
    queryKey: ["/api/student/files"],
  });

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">My Files</h1>

      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {files?.map((file) => (
            <Card key={file.id}>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2">{file.title}</h3>
                <p className="text-sm text-gray-500 mb-2">{file.type}</p>
                <a 
                  href={file.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 flex items-center gap-2"
                >
                  <FileIcon className="h-4 w-4" />
                  View File
                </a>
              </CardContent>
            </Card>
          ))}
          {(!files || files.length === 0) && (
            <p className="text-muted-foreground col-span-full text-center">
              No files assigned yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}
