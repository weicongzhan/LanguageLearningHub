import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, RotateCw, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@/hooks/use-user";
import type { UserLessonWithRelations, Progress } from "@db/schema";

export default function FlashcardPage() {
  const [, params] = useRoute("/lesson/:id");
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [flipped, setFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const studyStartTimeRef = useRef<Date>(new Date());

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
    // Initialize progress when lesson loads
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

    // Cleanup - update study time
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

  // Loading state
  if (isLoading || !userLesson?.lesson) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const flashcards = userLesson.lesson.flashcards || [];

  // No flashcards state
  if (flashcards.length === 0) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h1 className="text-3xl font-bold mb-4">{userLesson.lesson.title}</h1>
        <p className="text-muted-foreground">No flashcards available for this lesson.</p>
      </div>
    );
  }

  const currentCard = flashcards[currentIndex];

  // Event handlers
  const handleNext = () => {
    if (currentIndex < flashcards.length - 1) {
      setFlipped(false);
      setShowRating(false);
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setFlipped(false);
      setShowRating(false);
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleFlip = () => {
    setFlipped((prev) => !prev);
    if (!flipped) {
      setShowRating(true);
      if (currentCard?.audioUrl && audioRef.current) {
        audioRef.current.play();
      }
    }
  };

  const handleRating = async (successful: boolean) => {
    if (!userLesson) return;

    const progress = userLesson.progress as Progress || {
      total: flashcards.length,
      completed: 0,
      reviews: []
    };

    progress.reviews.push({
      timestamp: new Date().toISOString(),
      flashcardId: currentCard.id,
      successful
    });

    // Update completed count if this is first time seeing the card
    if (!progress.reviews.some(r => r.flashcardId === currentCard.id)) {
      progress.completed++;
    }

    await updateProgressMutation.mutateAsync({
      progress,
      totalStudyTime: userLesson.totalStudyTime || 0
    });

    handleNext();
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{userLesson.lesson.title}</h1>
        <p className="text-muted-foreground">
          Card {currentIndex + 1} of {flashcards.length}
        </p>
      </div>

      <div className="relative perspective-1000">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex + (flipped ? "-flipped" : "")}
            initial={{ rotateY: flipped ? -180 : 0 }}
            animate={{ rotateY: flipped ? 0 : 180 }}
            transition={{ duration: 0.6 }}
            className="relative preserve-3d"
          >
            <Card
              className={`w-full min-h-[300px] cursor-pointer ${
                flipped ? "backface-hidden" : ""
              }`}
              onClick={handleFlip}
            >
              <CardContent className="flex flex-col items-center justify-center min-h-[300px] p-6">
                <div className="text-2xl font-medium text-center">
                  {flipped ? currentCard?.back : currentCard?.front}
                </div>
                {flipped && currentCard?.audioUrl && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="mt-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (audioRef.current) {
                        audioRef.current.play();
                      }
                    }}
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>

        {showRating ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleRating(false)}
              className="text-red-500"
            >
              <ThumbsDown className="h-4 w-4 mr-2" />
              Incorrect
            </Button>
            <Button
              variant="outline"
              onClick={() => handleRating(true)}
              className="text-green-500"
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              Correct
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={handleFlip}
          >
            <RotateCw className="h-4 w-4 mr-2" />
            Flip
          </Button>
        )}

        <Button
          onClick={handleNext}
          disabled={currentIndex === flashcards.length - 1}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {currentCard?.audioUrl && (
        <audio ref={audioRef} src={currentCard.audioUrl} />
      )}
    </div>
  );
}