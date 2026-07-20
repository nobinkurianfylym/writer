"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The five-minute campaign wizard. Four steps, one flat schema — each step
 * validates only its own fields on Continue, and "Generate Campaign" is
 * where Phase 2's Campaign Brain will take this payload and plan the film's
 * publicity arc. For now it hands off to the mock campaign.
 */
const filmSchema = z.object({
  title: z.string().min(1, "Give your film a title"),
  genre: z.string().min(1, "Required"),
  language: z.string().min(1, "Required"),
  budget: z.coerce.number().positive("Must be a positive amount"),
  marketingBudget: z.coerce.number().positive("Must be a positive amount"),
  releaseDate: z.string().min(1, "Pick a date"),
  posterUrl: z.string().url("Enter a link").or(z.literal("")),
  trailerUrl: z.string().url("Enter a link").or(z.literal("")),
  cast: z.string().min(1, "Name at least one actor"),
  crew: z.string().min(1, "Name at least one crew member"),
});

type FilmValues = z.infer<typeof filmSchema>;
type FieldName = keyof FilmValues;

const STEPS: { title: string; blurb: string; fields: FieldName[] }[] = [
  {
    title: "The film",
    blurb: "What are we campaigning for?",
    fields: ["title", "genre", "language"],
  },
  {
    title: "The numbers",
    blurb: "Budgets shape the strategy, not the ambition.",
    fields: ["budget", "marketingBudget", "releaseDate"],
  },
  {
    title: "The material",
    blurb: "Links are fine — the Asset Vault takes files later.",
    fields: ["posterUrl", "trailerUrl"],
  },
  {
    title: "The people",
    blurb: "Comma-separate names; you can refine them any time.",
    fields: ["cast", "crew"],
  },
];

const FIELD_META: Record<FieldName, { label: string; type?: string; placeholder?: string }> = {
  title: { label: "Movie title", placeholder: "e.g. Thira" },
  genre: { label: "Genre", placeholder: "e.g. Neo-noir Thriller" },
  language: { label: "Language", placeholder: "e.g. Malayalam" },
  budget: { label: "Production budget (₹)", type: "number", placeholder: "45000000" },
  marketingBudget: { label: "Marketing budget (₹)", type: "number", placeholder: "8000000" },
  releaseDate: { label: "Release date", type: "date" },
  posterUrl: { label: "Poster link (optional)", placeholder: "https://…" },
  trailerUrl: { label: "Trailer link (optional)", placeholder: "https://…" },
  cast: { label: "Cast", placeholder: "Lead and principal cast" },
  crew: { label: "Crew", placeholder: "Director, DOP, music…" },
};

export function CreateFilmWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  const {
    register,
    trigger,
    handleSubmit,
    formState: { errors },
  } = useForm<FilmValues>({
    resolver: zodResolver(filmSchema),
    defaultValues: { posterUrl: "", trailerUrl: "" },
    mode: "onTouched",
  });

  async function next() {
    if (await trigger(current.fields)) setStep((s) => s + 1);
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <span
            key={s.title}
            className={cn(
              "h-1 flex-1 rounded-full",
              i <= step ? "bg-foreground" : "bg-raised",
            )}
          />
        ))}
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <p className="mt-8 text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {current.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{current.blurb}</p>

        <Card className="mt-6">
          <form
            className="space-y-4"
            onSubmit={handleSubmit(() => router.push("/campaign"))}
          >
            {current.fields.map((name) => {
              const meta = FIELD_META[name];
              return (
                <Field
                  key={name}
                  label={meta.label}
                  htmlFor={name}
                  error={errors[name]?.message}
                >
                  <Input
                    id={name}
                    type={meta.type ?? "text"}
                    placeholder={meta.placeholder}
                    {...register(name)}
                  />
                </Field>
              );
            })}

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => s - 1)}
                className={cn(step === 0 && "invisible")}
              >
                Back
              </Button>
              {last ? (
                <Button type="submit">Generate Campaign</Button>
              ) : (
                <Button type="button" onClick={next}>
                  Continue
                </Button>
              )}
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
