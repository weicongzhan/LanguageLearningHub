import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, ChevronLeft, ChevronRight } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import type { UserLessonWithRelations, Progress } from "@db/schema";

// Create audio contexts for correct and incorrect sounds
const createBeep = (frequency: number, duration: number) => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
};

const playCorrectSound = () => createBeep(800, 0.1);
const playIncorrectSound = () => {
  createBeep(300, 0.15);
  setTimeout(() => createBeep(300, 0.15), 160);
};

export default function FlashcardPage() {
  const [, params] = useRoute("/lesson/:id");
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [answeredCards, setAnsweredCards] = useState<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement>(null);
  const previousAudioRef = useRef<string | null>(null);
  const studyStartTimeRef = useRef<Date>(new Date());

  // Get the mode from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const isReviewMode = searchParams.get('mode') === 'review';

  // Query for lesson data
  const { data: userLesson, isLoading, error } = useQuery<UserLessonWithRelations>({
    queryKey: [`/api/user-lessons/${user?.id}/${params?.id}`],
    enabled: !!user && !!params?.id,
    staleTime: Infinity, // 防止自动重新获取数据
    cacheTime: Infinity,
  });

  // Handle error cases
  useEffect(() => {
    if (error) {
      console.error('Lesson access error:', error);
      toast({
        variant: "destructive",
        title: "错误",
        description: "无法访问该课程，请确认课程已分配给您",
      });
      setLocation("/"); // Redirect to dashboard on error
    }
  }, [error, setLocation]);

  // If no valid lesson found, redirect to dashboard
  useEffect(() => {
    if (!isLoading && !userLesson) {
      console.error('No lesson found for ID:', params?.id);
      toast({
        variant: "destructive",
        title: "错误",
        description: "未找到课程",
      });
      setLocation("/");
    }
  }, [isLoading, userLesson, setLocation, params?.id]);

  // Filter flashcards based on mode
  const allFlashcards = userLesson?.lesson?.flashcards || [];
  const [reviewCards, setReviewCards] = useState<number[]>([]); // 添加状态来跟踪错题本中的卡片

  // 初始化错题本卡片列表
  useEffect(() => {
    if (isReviewMode && userLesson?.lesson?.flashcards) {
      const wrongCards = allFlashcards
        .filter(flashcard => {
          if (!flashcard.imageChoices?.length || !flashcard.audioUrl || flashcard.correctImageIndex === undefined) {
            return false;
          }
          const progress = userLesson.progress as Progress;
          const reviews = progress.reviews || [];
          const flashcardReviews = reviews.filter(review => review.flashcardId === flashcard.id);
          return flashcardReviews.length > 0 && !flashcardReviews[flashcardReviews.length - 1].successful;
        })
        .map(card => card.id);
      setReviewCards(wrongCards);
    }
  }, [isReviewMode, userLesson?.lesson?.flashcards]);

  const flashcards = isReviewMode
    ? allFlashcards.filter(flashcard => {
        if (!flashcard.imageChoices?.length || !flashcard.audioUrl || flashcard.correctImageIndex === undefined) {
          return false;
        }
        // 只显示初始化时在错题本中的卡片
        return reviewCards.includes(flashcard.id);
      })
    : allFlashcards;

  // Get current flashcard
  const currentCard = flashcards[currentIndex];

  // Progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: async (data: { progress: Progress; totalStudyTime: number }) => {
      if (!userLesson?.id) return;
      const response = await fetch(`/api/user-lessons/${userLesson.id}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: 'include'
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: (data) => {
      // 手动更新缓存中的数据，而不是重新获取
      queryClient.setQueryData(
        [`/api/user-lessons/${user?.id}/${params?.id}`],
        (oldData: any) => ({
          ...oldData,
          progress: data.progress,
          totalStudyTime: data.totalStudyTime,
        })
      );
    },
  });

  if (isLoading || !userLesson?.lesson) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (flashcards.length === 0) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h1 className="text-3xl font-bold mb-4">{userLesson.lesson.title}</h1>
        <p className="text-muted-foreground">
          {isReviewMode
            ? "No flashcards need review at this time. Great job!"
            : "No flashcards available for this lesson."}
        </p>
        <Button onClick={() => setLocation("/")} className="mt-4">
          返回主页
        </Button>
      </div>
    );
  }

  const handleNext = () => {
    if (currentIndex < flashcards.length - 1) {
      setSelectedImage(null);
      setShowResult(false);
      setHasAnswered(false);
      setCurrentIndex((prev) => prev + 1);
    } else {
      toast({
        title: "课程完成",
        description: "恭喜你完成了这节课程！",
      });
      setLocation("/");
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setSelectedImage(null);
      setShowResult(false);
      setHasAnswered(false);
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleImageSelection = async (index: number) => {
    if (!userLesson?.lesson?.flashcards || !currentCard || hasAnswered) return;

    const isCorrect = index === currentCard.correctImageIndex;
    const progress: Progress = userLesson.progress as Progress || {
      total: userLesson.lesson.flashcards.length,
      completed: 0,
      reviews: []
    };

    // 记录本次练习结果
    progress.reviews.push({
      timestamp: new Date().toISOString(),
      flashcardId: currentCard.id,
      successful: isCorrect
    });

    // 立即标记已作答并显示结果
    setHasAnswered(true);
    setSelectedImage(index);
    setShowResult(true);

    // 立即播放音效并显示提示
    if (!isCorrect) {
      playIncorrectSound();
      toast({
        variant: "destructive",
        title: "错误!",
        description: "此卡片已加入错题本，请继续努力！"
      });
    } else {
      playCorrectSound();
      if (isReviewMode) {
        toast({
          title: "太棒了!",
          description: "答对了！此题已从错题本中移除。请点击下一题按钮继续练习。"
        });
      } else {
        toast({
          title: "正确!",
          description: "答对了，继续保持！"
        });
      }
    }

    try {
      // 后台更新进度
      await updateProgressMutation.mutateAsync({
        progress,
        totalStudyTime: userLesson.totalStudyTime || 0
      });

      // 如果答对了，更新完成数
      if (isCorrect) {
        if (isReviewMode) {
          // 更新完成数（如果还没计入的话）
          const hasBeenCounted = progress.reviews.slice(0, -1).some(r => 
            r.flashcardId === currentCard.id && r.successful
          );
          if (!hasBeenCounted) {
            progress.completed++;
            // 再次更新进度以保存完成数
            await updateProgressMutation.mutateAsync({
              progress,
              totalStudyTime: userLesson.totalStudyTime || 0
            });
          }
        } else {
          // 如果是首次答对，增加完成数
          const previousReviews = progress.reviews.slice(0, -1);
          if (!previousReviews.some(r => r.flashcardId === currentCard.id && r.successful)) {
            progress.completed++;
            // 再次更新进度以保存完成数
            await updateProgressMutation.mutateAsync({
              progress,
              totalStudyTime: userLesson.totalStudyTime || 0
            });
          }
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "保存进度失败",
        description: error.message
      });
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          <a 
            href="/" 
            onClick={async (e) => {
              e.preventDefault();
              // 先使缓存失效，确保返回主页时重新获取数据
              await queryClient.invalidateQueries({ queryKey: ['/api/user-lessons'] });
              await queryClient.invalidateQueries({ queryKey: [`/api/user-lessons/${user?.id}`] });
              // 然后导航回主页
              setLocation("/");
            }}
            className="hover:text-primary transition-colors"
          >
            {userLesson.lesson.title}
          </a>
        </h1>
        <p className="text-muted-foreground">
          Card {currentIndex + 1} of {flashcards.length}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-1">
            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                if (!audioRef.current || !currentCard?.audioUrl) return;
                
                try {
                  audioRef.current.src = currentCard.audioUrl;
                  await audioRef.current.load();
                  await audioRef.current.play().catch(err => {
                    console.error('Error playing audio:', err);
                    toast({
                      variant: "destructive",
                      title: "播放失败",
                      description: "无法播放音频"
                    });
                  });
                } catch (err) {
                  console.error('Error loading audio:', err);
                }
              }}
            >
              <Volume2 className="h-6 w-6" />
            </Button>
          </CardContent>
        </Card>

        {currentCard && (
          <div className="grid grid-cols-2 gap-4 max-w-[300px] mx-auto">
            {(currentCard.imageChoices as string[]).map((imageUrl, index) => (
              <Card
                key={index}
                className={`cursor-pointer transition-all aspect-square ${
                  selectedImage !== null && showResult
                    ? selectedImage === index
                      ? index === currentCard.correctImageIndex
                        ? "ring-2 ring-green-500"
                        : "ring-2 ring-red-500"
                      : ""
                    : selectedImage === index
                      ? "ring-2 ring-primary"
                      : "hover:ring-2 hover:ring-primary"
                }`}
                onClick={() => handleImageSelection(index)}
              >
                <CardContent className="p-0 h-full flex items-center justify-center">
                  <div className="aspect-square w-full h-full relative">
                    <img
                      src={imageUrl}
                      alt={`Choice ${index + 1}`}
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  </div>
                </CardContent>
                {showResult && selectedImage === index && index !== currentCard.correctImageIndex && (
                  <div className="absolute top-1 right-1 px-1 py-0.5 rounded text-xs text-white bg-red-500">
                    错误答案
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-between mt-2">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <Button
            onClick={handleNext}
            disabled={currentIndex === flashcards.length - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {currentCard && (
          <audio 
            ref={audioRef} 
            preload="auto"
            onError={(e) => {
              console.error('Audio error:', e);
            }}
          />
        )}
      </div>
    </div>
  );
}