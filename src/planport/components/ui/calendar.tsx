"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

import "react-day-picker/src/style.css";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  navLayout = "around",
  components,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout={navLayout}
      className={cn("w-fit", className)}
      classNames={{
        root: cn(defaults.root, "p-3"),
        months: cn(
          defaults.months,
          "relative flex flex-col gap-4 sm:flex-row sm:gap-4"
        ),
        month: cn(defaults.month, "flex w-full flex-col gap-4"),
        month_caption: cn(
          defaults.month_caption,
          "relative mx-10 flex h-9 items-center justify-center"
        ),
        caption_label: cn(defaults.caption_label, "text-sm font-medium"),
        nav: cn(defaults.nav, "hidden"),
        button_previous: cn(
          defaults.button_previous,
          buttonVariants({ variant: "outline" }),
          "absolute left-0 top-0 z-10 h-8 w-8 bg-background p-0 opacity-90 hover:opacity-100"
        ),
        button_next: cn(
          defaults.button_next,
          buttonVariants({ variant: "outline" }),
          "absolute right-0 top-0 z-10 h-8 w-8 bg-background p-0 opacity-90 hover:opacity-100"
        ),
        chevron: cn(defaults.chevron, "fill-primary"),
        month_grid: cn(defaults.month_grid, "w-full border-collapse"),
        weekdays: cn(defaults.weekdays),
        weekday: cn(
          defaults.weekday,
          "w-9 text-[0.8rem] font-normal text-muted-foreground"
        ),
        weeks: cn(defaults.weeks),
        week: cn(defaults.week),
        day: cn(
          defaults.day,
          "relative p-0 text-center [&:has([aria-selected])]:bg-accent [&:has([aria-selected])]:rounded-md"
        ),
        day_button: cn(
          defaults.day_button,
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        selected: cn(
          defaults.selected,
          "rounded-md bg-primary text-primary-foreground [&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:hover:bg-primary [&_button]:hover:text-primary-foreground"
        ),
        today: cn(defaults.today, "bg-accent text-accent-foreground"),
        outside: cn(
          defaults.outside,
          "text-muted-foreground/70 aria-selected:bg-secondary aria-selected:text-foreground"
        ),
        disabled: cn(
          defaults.disabled,
          "cursor-not-allowed text-muted-foreground opacity-40 [&_button]:cursor-not-allowed [&_button]:opacity-40"
        ),
        hidden: cn(defaults.hidden, "invisible"),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chClass, orientation, ...chProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return (
            <Icon
              className={cn("h-4 w-4", chClass)}
              {...(chProps as React.SVGProps<SVGSVGElement>)}
            />
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
