import {
  Button,
  Input,
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@fylym/ui";

const buttonVariants = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;

export default function DesignPage() {
  return (
    <TooltipProvider>
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
        <header>
          <h1 className="text-2xl font-semibold">FYLYM design system</h1>
          <p className="text-muted-foreground text-sm">
            Toggle your OS theme to compare light/dark tokens.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Buttons</h2>
          <div className="flex flex-wrap gap-3">
            {buttonVariants.map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Input</h2>
          <Input placeholder="INT. COFFEE SHOP - DAY" className="max-w-sm" />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Tooltip</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>Scene heading autocomplete</TooltipContent>
          </Tooltip>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Script font (Courier Prime, 12pt)</h2>
          <div
            className="rounded-md border border-border bg-card p-6 text-script font-script"
            data-testid="script-sample"
          >
            <p>INT. COFFEE SHOP - DAY</p>
            <p className="mt-4">
              MAYA sits alone at a corner table, laptop open, coffee untouched.
            </p>
          </div>
        </section>
      </main>
    </TooltipProvider>
  );
}
