import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@/hooks/use-user";
import type { UserLessonWithRelations } from "@db/schema";

export default function FlashcardPage() {
  const [, params] = useRoute("/lesson/:id");
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [flipped, setFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { data: userLesson, isLoading } = useQuery<UserLessonWithRelations>({
    queryKey: [`/api/user-lessons/${user?.id}`, params?.id],
    enabled: !!user && !!params?.id,
  });

  const updateProgressMutation = useMutation({
    mutationFn: async (progress: any) => {
      const response = await fetch(`/api/user-lessons/${userLesson?.id}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/user-lessons/${user?.id}`, params?.id],
      });
    },
  });

  const flashcards = userLesson?.lesson.flashcards || [];
  const currentCard = flashcards[currentIndex];

  useEffect(() => {
    if (userLesson && flashcards.length > 0) {
      const progress = userLesson.progress || {};
      progress.total = flashcards.length;
      updateProgressMutation.mutate(progress);
    }
  }, [userLesson, flashcards.length]);

  const handleNext = () => {
    if (currentIndex < flashcards.length - 1) {
      setFlipped(false);
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setFlipped(false);
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleFlip = () => {
    setFlipped((prev) => !prev);
    if (!flipped && currentCard.audioUrl && audioRef.current) {
      audioRef.current.play();
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{userLesson?.lesson.title}</h1>
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
        <Button
          variant="outline"
          onClick={() => setFlipped((prev) => !prev)}
        >
          <RotateCw className="h-4 w-4 mr-2" />
          Flip
        </Button>
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