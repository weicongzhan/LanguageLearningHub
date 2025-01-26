import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, BookOpen } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useState } from "react";
import { useTranslation, type Language } from "@/lib/translations";
import type { UserLessonWithRelations } from "@db/schema";

export default function StudentDashboard() {
  const { user } = useUser();
  const [language, setLanguage] = useState<Language>('en');
  const { t, languages } = useTranslation(language);

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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">
            {t('welcome')}, {user?.username}!
          </h1>
          <p className="text-muted-foreground">{t('assignedLessons')}</p>
        </div>
        <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {lang.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                    <span>{t('progress')}</span>
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
                  <Button className="w-full mt-4">{t('continueButton')}</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
          {userLessons?.length === 0 && (
            <p className="text-muted-foreground col-span-full text-center">
              {t('noLessons')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}