import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import type { UserLessonWithRelations } from "@db/schema";

export default function StudentDashboard() {
  const { user } = useUser();

  const { data: userLessons, isLoading } = useQuery<UserLessonWithRelations[]>({
    queryKey: [`/api/user-lessons/${user?.id}`],
    enabled: !!user,
  });

  const calculateProgress = (progress: Record<string, any>) => {
    if (!progress || Object.keys(progress).length === 0) return 0;
    const total = progress.total || 0;
    const completed = progress.completed || 0;
    return total > 0 ? (completed / total) * 100 : 0;
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Welcome, {user?.username}!</h1>
        <p className="text-muted-foreground">Your assigned lessons are below</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {userLessons?.map((userLesson) => (
            <Card key={userLesson.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  {userLesson.lesson.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {userLesson.lesson.description}
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>
                      {Math.round(calculateProgress(userLesson.progress))}%
                    </span>
                  </div>
                  <Progress
                    value={calculateProgress(userLesson.progress)}
                    className="h-2"
                  />
                </div>
                <Link href={`/lesson/${userLesson.lessonId}`}>
                  <Button className="w-full mt-4">Continue Learning</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
          {userLessons?.length === 0 && (
            <p className="text-muted-foreground col-span-full text-center">
              No lessons assigned yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}