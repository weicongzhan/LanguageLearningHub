import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Clock, Target, RefreshCw } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import type { UserLessonWithRelations } from "@db/schema";
import type { Progress as ProgressType } from "@db/schema";

export default function StudentDashboard() {
  const { user } = useUser();

  const { data: userLessons, isLoading } = useQuery<UserLessonWithRelations[]>({
    queryKey: [`/api/user-lessons/${user?.id}`],
    enabled: !!user,
  });

  const calculateProgress = (progress: ProgressType | null) => {
    if (!progress) return { percent: 0, success: 0, needsReview: 0 };
    const percent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
    const reviews = progress.reviews || [];
    const success = reviews.length > 0 
      ? (reviews.filter(review => review.successful).length / reviews.length) * 100 
      : 0;

    // Calculate cards that need review (were answered incorrectly)
    const incorrectCards = new Set();
    reviews.forEach(review => {
      if (!review.successful) {
        incorrectCards.add(review.flashcardId);
      }
    });

    return { 
      percent, 
      success,
      needsReview: incorrectCards.size
    };
  };

  const formatStudyTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
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
          {userLessons?.map((userLesson) => {
            const { percent, success, needsReview } = calculateProgress(userLesson.progress as ProgressType);
            return (
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

                  <div className="space-y-4">
                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{Math.round(percent)}%</span>
                      </div>
                      <ProgressBar value={percent} className="h-2" />
                    </div>

                    {/* Study Stats */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{formatStudyTime(userLesson.totalStudyTime || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1 justify-end">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span>{Math.round(success)}% correct</span>
                      </div>
                    </div>

                    {/* Study and Review Buttons */}
                    <div className="space-y-2">
                      <div className="space-x-2">
                        <Link href={`/lesson/${userLesson.lessonId}`}>
                          <Button className="w-full">Continue Learning</Button>
                        </Link>
                        {needsReview > 0 && (
                          <Link href={`/lesson/${userLesson.lessonId}?mode=review`}>
                            <Button variant="outline" className="w-full">
                              Review {needsReview} Cards
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(!userLessons || userLessons.length === 0) && (
            <p className="text-muted-foreground col-span-full text-center">
              No lessons assigned yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}