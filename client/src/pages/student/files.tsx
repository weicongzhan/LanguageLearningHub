
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileIcon, Music, Video, Image } from "lucide-react";

type File = {
  id: number;
  title: string;
  type: string;
  url: string;
  createdAt: string;
};

const FileTypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'audio':
      return <Music className="h-8 w-8 text-blue-500" />;
    case 'video':
      return <Video className="h-8 w-8 text-purple-500" />;
    case 'image':
      return <Image className="h-8 w-8 text-green-500" />;
    default:
      return <FileIcon className="h-8 w-8 text-gray-500" />;
  }
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
            <Card key={file.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <FileTypeIcon type={file.type} />
                  <div>
                    <h3 className="font-semibold text-lg">{file.title}</h3>
                    <p className="text-sm text-gray-500 capitalize">{file.type}</p>
                  </div>
                </div>
                <a 
                  href={file.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-500 hover:text-blue-700 hover:underline mt-2"
                >
                  <FileIcon className="h-4 w-4" />
                  Open File
                </a>
                <p className="text-xs text-gray-400 mt-4">
                  Added: {new Date(file.createdAt).toLocaleDateString()}
                </p>
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
