import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { 
  BookOpen, 
  Users, 
  Plus,
  Loader2,
  Search
} from "lucide-react";
import { useState } from "react";

type Stats = {
  totalLessons: number;
  totalStudents: number;
  totalFlashcards: number;
};

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: students } = useQuery<{ id: number; username: string; isAdmin: boolean }[]>({
    queryKey: ["/api/students"],
  });

  // 过滤学生列表
  const filteredStudents = students?.filter(student => 
    student.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-4">
          <Link href="/files">
            <Button>
              Manage Files
            </Button>
          </Link>
          <Link href="/lessons">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create New Lesson
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Lessons
              </CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalLessons || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Students
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalStudents || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Flashcards
              </CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalFlashcards || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Admin Management Section */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">管理员设置</h2>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索用户..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        {(stats?.totalStudents ?? 0) > 0 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                选择要设置为管理员的用户：
              </p>
              <p className="text-sm text-muted-foreground">
                找到 {filteredStudents?.length || 0} 个用户
              </p>
            </div>
            <div className="grid gap-4">
              {filteredStudents?.map(student => (
                <Card key={student.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center space-x-4">
                      <div>
                        <p className="font-medium">{student.username}</p>
                      </div>
                    </div>
                    <Button
                      variant={student.isAdmin ? "destructive" : "default"}
                      onClick={async () => {
                        try {
                          const response = await fetch(`/api/users/${student.id}/admin`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ isAdmin: !student.isAdmin }),
                          });
                          if (response.ok) {
                            queryClient.invalidateQueries({ queryKey: ["/api/students"] });
                          }
                        } catch (error) {
                          console.error('Failed to update admin status:', error);
                        }
                      }}
                    >
                      {student.isAdmin ? "移除管理员" : "设为管理员"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            {filteredStudents?.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">没有找到匹配的用户</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
