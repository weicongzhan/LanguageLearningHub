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
  const flashcards = isReviewMode
    ? allFlashcards.filter(flashcard => {
        if (!flashcard.imageChoices?.length || !flashcard.audioUrl || flashcard.correctImageIndex === undefined) {
          return false;
        }
        const progress = userLesson.progress as Progress;
        const reviews = progress.reviews || [];
        const flashcardReviews = reviews.filter(review => review.flashcardId === flashcard.id);
        return flashcardReviews.length > 0 && !flashcardReviews[flashcardReviews.length - 1].successful;
      })
    : allFlashcards;

  // Get current flashcard
  const currentCard = flashcards[currentIndex];

  // Effects
  // Auto-play audio when card changes
  useEffect(() => {
    if (audioRef.current && currentCard?.audioUrl) {
      audioRef.current.src = currentCard.audioUrl;
      audioRef.current.load();
      const playPromise = audioRef.current.play();
      if (playPromise) {
        playPromise.catch(err => {
          console.error('Error playing audio:', err);
          toast({
            variant: "destructive",
            title: "播放失败",
            description: "无法播放音频"
          });
        });
      }
    }
  }, [currentIndex, currentCard?.audioUrl]);

  useEffect(() => {
    if (userLesson?.lesson?.flashcards && userLesson.lesson.flashcards.length > 0) {
      const progress = userLesson.progress as Progress || {
        total: userLesson.lesson.flashcards.length,
        completed: 0,
        reviews: []
      };
      progress.total = userLesson.lesson.flashcards.length;
      updateProgressMutation.mutate({
        progress,
        totalStudyTime: userLesson.totalStudyTime || 0
      });
    }

    return () => {
      if (userLesson) {
        const studyTime = Math.floor((new Date().getTime() - studyStartTimeRef.current.getTime()) / 1000);
        updateProgressMutation.mutate({
          progress: userLesson.progress as Progress,
          totalStudyTime: (userLesson.totalStudyTime || 0) + studyTime
        });
      }
    };
  }, [userLesson?.lesson?.flashcards?.length]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/user-lessons/${user?.id}/${params?.id}`],
      });
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
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleImageSelection = (index: number) => {
    setSelectedImage(index);
    setShowResult(true);

    const isCorrect = index === currentCard.correctImageIndex;
    const progress = userLesson.progress as Progress || {
      total: flashcards.length,
      completed: 0,
      reviews: []
    };

    progress.reviews.push({
      timestamp: new Date().toISOString(),
      flashcardId: currentCard.id,
      successful: isCorrect
    });

    if (isReviewMode && isCorrect) {
      progress.completed++;
    }

    if (isCorrect) {
      playCorrectSound();
      if (!progress.reviews.some(r => r.flashcardId === currentCard.id)) {
        progress.completed++;
      }
    } else {
      playIncorrectSound();
      toast({
        variant: "destructive",
        title: "错误!",
        description: "请再试一次"
      });
    }

    updateProgressMutation.mutate({
      progress,
      totalStudyTime: userLesson.totalStudyTime || 0
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{userLesson.lesson.title}</h1>
        <p className="text-muted-foreground">
          Card {currentIndex + 1} of {flashcards.length}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-3"> {/*Reduced padding here*/}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (audioRef.current && currentCard?.audioUrl) {
                  audioRef.current.src = currentCard.audioUrl;
                  audioRef.current.load();
                  const playPromise = audioRef.current.play();
                  if (playPromise) {
                    playPromise.catch(err => {
                      console.error('Error playing audio:', err);
                      toast({
                        variant: "destructive",
                        title: "播放失败",
                        description: "无法播放音频"
                      });
                    });
                  }
                }
              }}
            >
              <Volume2 className="h-6 w-6" />
            </Button>
          </CardContent>
        </Card>

        {currentCard && (
          <div className="grid grid-cols-2 gap-2"> {/*Reduced gap here*/}
            {(currentCard.imageChoices as string[]).map((imageUrl, index) => (
              <Card
                key={index}
                className={`cursor-pointer transition-all ${
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
                <CardContent className="p-1"> {/*Reduced padding here*/}
                  <div className="aspect-square relative max-w-[100px] mx-auto">
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

        <div className="flex justify-between mt-4"> {/*Reduced margin here*/}
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
          <audio ref={audioRef} src={currentCard.audioUrl} />
        )}
      </div>
    </div>
  );
}