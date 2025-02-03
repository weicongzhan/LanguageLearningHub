import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Clock, Target } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import type { UserLessonWithRelations } from "@db/schema";

export default function StudentDashboard() {
  const { user } = useUser();

  const { data: userLessons, isLoading } = useQuery<UserLessonWithRelations[]>({
    queryKey: [`/api/user-lessons/${user?.id}`],
    enabled: !!user,
  });

  const calculateProgress = (progress: any) => {
    if (!progress) return { percent: 0, success: 0, needsReview: 0 };
    const percent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
    const reviews = progress.reviews || [];

    // Calculate success rate
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
        <p className="text-muted-foreground">欢迎, {user?.username}!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Review Book Section */}
        {userLessons?.some(lesson => calculateProgress(lesson.progress).needsReview > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                错题本
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {userLessons.map(lesson => {
                  const { needsReview } = calculateProgress(lesson.progress);
                  if (needsReview > 0) {
                    return (
                      <div key={lesson.id} className="space-y-4">
                        <span>{lesson.lesson.title}</span>
                        <div className="pt-4">
                          <Link href={`/lesson/${lesson.lessonId}?mode=review`}>
                            <Button className="w-full">
                              复习 {lesson.lesson.flashcards.filter(flashcard => {
                                const progress = lesson.progress as Progress;
                                const reviews = progress.reviews || [];
                                const flashcardReviews = reviews.filter(review => review.flashcardId === flashcard.id);
                                const lastReview = flashcardReviews[flashcardReviews.length - 1];
                                return lastReview && !lastReview.successful;
                              }).length} 道题
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </CardContent>
          </Card>
        )}

      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <>
          {userLessons?.map((userLesson) => {
            const { percent, success, needsReview } = calculateProgress(userLesson.progress);
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
                        <span>学习进度</span>
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
                        <span>{Math.round(success)}% 正确率</span>
                      </div>
                    </div>

                    {/* Study and Review Buttons */}
                    <div className="space-y-2">
                      <Link href={`/lesson/${userLesson.lessonId}`}>
                        <Button className="w-full">继续学习</Button>
                      </Link>


                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(!userLessons || userLessons.length === 0) && (
            <p className="text-muted-foreground col-span-full text-center">
              还没有分配课程
            </p>
          )}
        </>
      )}
      </div>
    </div>
  );
}