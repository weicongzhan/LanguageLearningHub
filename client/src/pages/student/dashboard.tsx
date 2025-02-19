import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Clock, Target, FileIcon, Music, Video, Image } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import type { UserLessonWithRelations, Progress } from "@db/schema";
import { useEffect } from "react";

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

export default function StudentDashboard() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  // 在组件挂载时强制刷新数据
  useEffect(() => {
    const refreshData = async () => {
      // 强制重新获取数据
      await queryClient.invalidateQueries({ queryKey: ['/api/user-lessons'] });
      await queryClient.invalidateQueries({ queryKey: [`/api/user-lessons/${user?.id}`] });
      await queryClient.refetchQueries({ queryKey: ['/api/user-lessons'] });
      await queryClient.refetchQueries({ queryKey: [`/api/user-lessons/${user?.id}`] });
    };
    refreshData();
  }, [queryClient, user?.id]);

  // 查询用户课程数据
  const { data: userLessons, isLoading } = useQuery<UserLessonWithRelations[]>({
    queryKey: [`/api/user-lessons/${user?.id}`],
    enabled: !!user,
  });

  const calculateProgress = (progress: Progress) => {
    if (!progress) return { percent: 0, success: 0, needsReview: 0 };
    const percent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
    const reviews = progress.reviews || [];

    // Calculate success rate
    const success = reviews.length > 0 
      ? (reviews.filter((review: { successful: boolean }) => review.successful).length / reviews.length) * 100 
      : 0;

    // Calculate cards that need review (were answered incorrectly)
    const incorrectCards = new Set();
    reviews.forEach((review: { successful: boolean; flashcardId: number }) => {
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

  // 计算所有需要复习的卡片
  const calculateTotalReviewCards = (lessons: UserLessonWithRelations[]) => {
    const allWrongCards = new Set<number>();
    
    lessons.forEach(lesson => {
      const progress = lesson.progress as Progress;
      if (!progress || !progress.reviews) return;
      
      // 获取每个卡片的最后一次回答记录
      const lastReviews = new Map<number, boolean>();
      progress.reviews.forEach(review => {
        lastReviews.set(review.flashcardId, review.successful);
      });
      
      // 只添加最后一次回答错误的卡片
      lastReviews.forEach((successful, flashcardId) => {
        if (!successful) {
          allWrongCards.add(flashcardId);
        }
      });
    });
    
    return allWrongCards.size;
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
        {userLessons && calculateTotalReviewCards(userLessons) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                错题本
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(() => {
                  const totalWrongQuestions = calculateTotalReviewCards(userLessons);
                  
                  if (totalWrongQuestions > 0) {
                    // 收集所有有错题的课程ID
                    const lessonsWithWrongQuestions = userLessons
                      .filter(lesson => calculateProgress(lesson.progress as Progress).needsReview > 0)
                      .map(lesson => lesson.lessonId)
                      .join(',');

                    return (
                      <div className="space-y-4">
                        <span>总共有 {totalWrongQuestions} 道需要复习的题目</span>
                        <div className="pt-4">
                          <Link href={`/lesson/${lessonsWithWrongQuestions}?mode=review&combined=true`}>
                            <Button className="w-full">
                              开始复习 {totalWrongQuestions} 道题
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
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
            const { percent, success, needsReview } = calculateProgress(userLesson.progress as Progress);
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
                      <Link href={`/lesson/${userLesson.lessonId}`} onClick={(e) => {
                        // Force a hard navigation
                        window.location.href = `/lesson/${userLesson.lessonId}`;
                        e.preventDefault();
                      }}>
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

      {/* Files Link Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            查看资源
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            查看分配的文件
          </p>
          <div className="space-y-4">
            <Link href="/files">
              <Button className="w-full">
                查看分配的文件
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}