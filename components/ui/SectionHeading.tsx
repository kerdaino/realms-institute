import { cn } from "@/lib/utils";
import { realmClasses } from "@/lib/theme";

type SectionHeadingProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  align?: "left" | "center";
};

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  className,
  align = "left",
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p className={cn("mb-3", realmClasses.caption)}>
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className={realmClasses.headingSection}
      >
        {title}
      </h2>
      {description ? (
        <p className={cn("mt-5", realmClasses.body)}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
