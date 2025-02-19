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
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previousAudioRef = useRef<string | null>(null);
  const studyStartTimeRef = useRef<Date>(new Date());

  // Get the mode from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const isReviewMode = searchParams.get('mode') === 'review';

  // Query for lesson data
  const { data: userLessons, isLoading, error } = useQuery<UserLessonWithRelations[]>({
    queryKey: [`/api/user-lessons/${user?.id}`, params?.id ? [params.id] : []],
    enabled: !!user && (params?.id ? [params.id] : []).length > 0,
    staleTime: Infinity,
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
    if (!isLoading && !userLessons) {
      console.error('No lesson found for ID:', params?.id);
      toast({
        variant: "destructive",
        title: "错误",
        description: "未找到课程",
      });
      setLocation("/");
    }
  }, [isLoading, userLessons, setLocation, params?.id]);

  // Filter flashcards based on mode
  const allFlashcards = userLessons?.flatMap(userLesson => 
    (userLesson.lesson?.flashcards || []).map((flashcard: { 
      id: number; 
      imageChoices: unknown; 
      audioUrl: string; 
      correctImageIndex: number;
    }) => ({
      ...flashcard,
      imageChoices: flashcard.imageChoices as string[],
      userLessonId: userLesson.id,
      lessonTitle: userLesson.lesson.title
    }))
  ) || [];

  // 初始化错题本卡片列表
  const [reviewCards, setReviewCards] = useState<number[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [completedCards, setCompletedCards] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isReviewMode && userLessons && isInitialLoad) {
      const wrongCards = allFlashcards
        .filter((flashcard: {
          id: number;
          imageChoices: string[];
          audioUrl: string;
          correctImageIndex: number;
          userLessonId: number;
        }) => {
          if (!flashcard.imageChoices.length || !flashcard.audioUrl || flashcard.correctImageIndex === undefined) {
            return false;
          }
          const userLesson = userLessons.find(ul => ul.id === flashcard.userLessonId);
          if (!userLesson) return false;
          
          const progress = userLesson.progress as Progress;
          const reviews = progress.reviews || [];
          const flashcardReviews = reviews.filter(review => review.flashcardId === flashcard.id);
          return flashcardReviews.length > 0 && !flashcardReviews[flashcardReviews.length - 1].successful;
        })
        .map(card => card.id);
      
      setReviewCards(wrongCards);
      setIsInitialLoad(false);
    }
  }, [isReviewMode, userLessons, allFlashcards, isInitialLoad]);

  const flashcards = isReviewMode
    ? allFlashcards.filter((flashcard: {
        id: number;
        imageChoices: string[];
        audioUrl: string;
        correctImageIndex: number;
      }) => {
        if (!flashcard.imageChoices.length || !flashcard.audioUrl || flashcard.correctImageIndex === undefined) {
          return false;
        }
        return reviewCards.includes(flashcard.id);
      })
    : allFlashcards.filter((flashcard: {
        userLessonId: number;
        imageChoices: string[];
        audioUrl: string;
        correctImageIndex: number;
      }) => {
        const currentUserLesson = userLessons?.find(ul => ul.id === flashcard.userLessonId);
        return currentUserLesson?.lessonId === parseInt(params?.id || '0');
      });

  // Get current flashcard
  const currentCard = flashcards[currentIndex];

  // 新增：打乱数组顺序的函数
  const shuffleArray = (array: any[]) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // 在卡片切换时重新打乱选项顺序
  useEffect(() => {
    if (currentCard?.imageChoices && !isTransitioning && !hasAnswered) {
      const indices = Array.from({ length: currentCard.imageChoices.length }, (_, i) => i);
      // 使用 cardId 作为随机种子，确保同一张卡片的选项顺序保持一致
      const seed = currentCard.id;
      const seededRandom = (max: number) => {
        const x = Math.sin(seed + 1) * 10000;
        return Math.floor((x - Math.floor(x)) * max);
      };
      
      const shuffled = [...indices];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = seededRandom(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      setShuffledIndices(shuffled);
    }
  }, [currentCard?.id, isTransitioning, hasAnswered]);

  // Progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: async (data: { progress: Progress; totalStudyTime: number }) => {
      if (!userLessons) return;
      const userLesson = userLessons.find(ul => ul.id === currentCard.userLessonId);
      if (!userLesson) return;
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

  // 检查是否所有卡片都已完成
  const allCardsCompleted = isReviewMode && completedCards.size === flashcards.length;

  if (isLoading || !userLessons) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (flashcards.length === 0) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h1 className="text-3xl font-bold mb-4">{userLessons[0].lesson.title}</h1>
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
    if (isTransitioning || !hasAnswered) return;
    
    if (currentIndex < flashcards.length - 1) {
      setIsTransitioning(true);
      setSelectedImage(null);
      setShowResult(false);
      setHasAnswered(false);
      setCurrentIndex(prev => prev + 1);
      
      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    } else if (allCardsCompleted) {
      toast({
        title: isReviewMode ? "复习完成" : "课程完成",
        description: isReviewMode ? "恭喜你完成了错题复习！" : "恭喜你完成了这节课程！",
        duration: 2000
      });
      setTimeout(() => {
        setLocation("/");
      }, 2000);
    }
  };

  const handlePrevious = () => {
    if (isTransitioning) return;
    
    if (currentIndex > 0) {
      setIsTransitioning(true);
      setSelectedImage(null);
      setShowResult(false);
      setHasAnswered(false);
      setCurrentIndex((prev) => prev - 1);
      
      // 添加延迟以确保动画平滑
      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }
  };

  const handleImageSelection = async (index: number) => {
    if (!userLessons || !currentCard || hasAnswered || isTransitioning) return;

    // 使用shuffledIndices将选择的索引映射回原始索引
    const originalIndex = shuffledIndices.indexOf(currentCard.correctImageIndex);
    const isCorrect = index === originalIndex;

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
        description: "此卡片已加入错题本，请继续努力！",
        className: "w-[250px] text-sm fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        duration: 1000
      });
    } else {
      playCorrectSound();
      if (isReviewMode) {
        // 标记当前卡片为已完成
        setCompletedCards(prev => new Set([...prev, currentCard.id]));
        
        toast({
          title: "太棒了!",
          description: "答对了！此题已从错题本中移除。点击下一题按钮继续。",
          className: "w-[250px] text-sm fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          duration: 2000
        });

        // 检查是否所有卡片都已完成
        if (completedCards.size + 1 === flashcards.length) {
          setTimeout(() => {
            toast({
              title: "复习完成",
              description: "恭喜你完成了所有错题的复习！",
              duration: 2000
            });
            setTimeout(() => {
              setLocation("/");
            }, 2000);
          }, 2000);
        }
      } else {
        toast({
          title: "正确!",
          description: "答对了，继续保持！",
          className: "w-[250px] text-sm fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          duration: 1000
        });
      }
    }

    try {
      // 找到当前卡片所属的课程
      const userLesson = userLessons.find(ul => ul.id === currentCard.userLessonId);
      if (!userLesson) return;

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

      // 如果答对了，更新完成数
      if (isCorrect) {
        const hasBeenCounted = progress.reviews.slice(0, -1).some(r => 
          r.flashcardId === currentCard.id && r.successful
        );
        if (!hasBeenCounted) {
          progress.completed++;
        }
      }

      // 更新进度
      await updateProgressMutation.mutateAsync({
        progress,
        totalStudyTime: userLesson.totalStudyTime || 0
      });

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "保存进度失败",
        description: error.message
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <div className="container mx-auto pt-0.5 px-6 max-w-2xl">
        <div className="mb-0.5 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary"></div>
            <p className="text-lg text-muted-foreground">
              {userLessons[0].lesson.title} - Card {currentIndex + 1} of {flashcards.length}
              {isReviewMode && ` (已完成: ${completedCards.size}/${flashcards.length})`}
            </p>
            <div className="h-2 w-2 rounded-full bg-primary"></div>
          </div>
        </div>

        <div className="space-y-8">
          <Card className={`shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-background to-muted/10 ${isTransitioning ? 'opacity-50' : ''}`}>
            <CardContent className="flex items-center justify-center p-2">
              <Button
                variant="outline"
                size="icon"
                className="w-12 h-12 rounded-full hover:scale-110 transition-all duration-300 shadow-md hover:shadow-xl bg-gradient-to-br from-primary/10 to-primary/5"
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
                <Volume2 className="h-6 w-6 text-primary" />
              </Button>
            </CardContent>
          </Card>

          {currentCard && (
            <div className={`grid grid-cols-2 gap-6 max-w-[600px] mx-auto transition-opacity duration-300 ${isTransitioning ? 'opacity-50' : ''}`}>
              {shuffledIndices.map((originalIndex, currentIndex) => (
                <Card
                  key={originalIndex}
                  className={`cursor-pointer transition-all duration-300 aspect-square hover:scale-105 group ${
                    selectedImage !== null && showResult
                      ? selectedImage === currentIndex
                        ? originalIndex === currentCard.correctImageIndex
                          ? "ring-4 ring-green-500/50 shadow-lg shadow-green-500/20 bg-green-50/50"
                          : "ring-4 ring-red-500/50 shadow-lg shadow-red-500/20 bg-red-50/50"
                        : "opacity-50"
                      : selectedImage === currentIndex
                        ? "ring-4 ring-primary/50 shadow-lg shadow-primary/20 bg-primary-50/50"
                        : "hover:ring-4 hover:ring-primary/30 hover:shadow-lg hover:shadow-primary/10 bg-card hover:bg-primary-50/10"
                  }`}
                  onClick={() => handleImageSelection(currentIndex)}
                >
                  <CardContent className="p-2 h-full flex items-center justify-center">
                    <div className="aspect-square w-full h-full relative rounded-xl overflow-hidden bg-white/80 group-hover:bg-white/100 transition-colors duration-300">
                      <img
                        src={currentCard.imageChoices[originalIndex]}
                        alt={`Choice ${currentIndex + 1}`}
                        className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex justify-between mt-8 px-4">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="hover:scale-105 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed w-32"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            <Button
              onClick={handleNext}
              disabled={currentIndex === flashcards.length - 1}
              className="hover:scale-105 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed w-32"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
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