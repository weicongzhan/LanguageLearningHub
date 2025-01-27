import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const studyStartTimeRef = useRef<Date>(new Date());

  // Get the mode from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const isReviewMode = searchParams.get('mode') === 'review';

  // Query for lesson data
  const { data: userLesson, isLoading } = useQuery<UserLessonWithRelations>({
    queryKey: [`/api/user-lessons/${user?.id}/${params?.id}`],
    enabled: !!user && !!params?.id,
  });

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

  // Effects
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

  if (isLoading || !userLesson?.lesson) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Filter flashcards based on mode
  const allFlashcards = userLesson?.lesson?.flashcards || [];
  const flashcards = isReviewMode
    ? allFlashcards.filter(flashcard => {
        const progress = userLesson.progress as Progress;
        const reviews = progress.reviews || [];
        // Find the most recent review for this flashcard
        const lastReview = [...reviews]
          .reverse()
          .find(review => review.flashcardId === flashcard.id);
        // Include in review if the last attempt was unsuccessful
        return lastReview && !lastReview.successful;
      })
    : allFlashcards;

  if (flashcards.length === 0) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h1 className="text-3xl font-bold mb-4">{userLesson.lesson.title}</h1>
        <p className="text-muted-foreground">
          {isReviewMode
            ? "No flashcards need review at this time. Great job!"
            : "No flashcards available for this lesson."}
        </p>
      </div>
    );
  }

  const currentCard = flashcards[currentIndex];

  const handleNext = () => {
    if (currentIndex < flashcards.length - 1) {
      setSelectedImage(null);
      setShowResult(false);
      setCurrentIndex((prev) => prev + 1);
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

    // Only add to reviews if this is a new selection
    if (!progress.reviews.some(r => r.flashcardId === currentCard.id && r.timestamp === new Date().toISOString())) {
      progress.reviews.push({
        timestamp: new Date().toISOString(),
        flashcardId: currentCard.id,
        successful: isCorrect
      });

      // Update completed count if this is first time seeing the card
      if (!progress.reviews.some(r => r.flashcardId === currentCard.id)) {
        progress.completed++;
      }

      // Play sound effect based on correctness
      if (isCorrect) {
        playCorrectSound();
      } else {
        playIncorrectSound();
      }

      // Show feedback toast only for new selections
      toast({
        variant: isCorrect ? "default" : "destructive",
        title: isCorrect ? "正确!" : "错误!",
        description: isCorrect
          ? "非常好，继续保持!"
          : "再试一次吧，不要灰心!",
      });

      updateProgressMutation.mutate({
        progress,
        totalStudyTime: userLesson.totalStudyTime || 0
      });
    }
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
        {/* Audio Section */}
        <Card>
          <CardContent className="flex items-center justify-center py-6">
            <Button
              variant="outline"
              size="icon"
              onClick={() => audioRef.current?.play()}
            >
              <Volume2 className="h-6 w-6" />
            </Button>
          </CardContent>
        </Card>

        {/* Image Choices */}
        <div className="grid grid-cols-2 gap-4">
          {(currentCard.imageChoices as string[]).map((imageUrl, index) => (
            <Card
              key={index}
              className={`cursor-pointer transition-all ${
                selectedImage === index
                  ? showResult
                    ? index === currentCard.correctImageIndex
                      ? "ring-4 ring-green-500"
                      : "ring-4 ring-red-500"
                    : "ring-4 ring-primary"
                  : "hover:ring-2 hover:ring-primary"
              }`}
              onClick={() => handleImageSelection(index)}
            >
              <CardContent className="p-2">
                <img
                  src={imageUrl}
                  alt={`Choice ${index + 1}`}
                  className="w-full h-48 object-cover rounded"
                />
              </CardContent>
              {showResult && (
                <div className={`absolute top-2 right-2 px-2 py-1 rounded text-sm text-white
                  ${index === currentCard.correctImageIndex
                    ? "bg-green-500"
                    : selectedImage === index
                      ? "bg-red-500"
                      : "hidden"
                  }`}>
                  {index === currentCard.correctImageIndex
                    ? "正确答案"
                    : selectedImage === index
                      ? "错误答案"
                      : ""}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
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

        <audio ref={audioRef} src={currentCard.audioUrl} />
      </div>
    </div>
  );
}