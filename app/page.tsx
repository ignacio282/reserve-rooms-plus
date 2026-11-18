import { Suspense } from "react";
import { Board } from "@/app/_components/Board";
import { BoardLoading } from "@/app/_components/BoardLoading";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<BoardLoading />}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}
