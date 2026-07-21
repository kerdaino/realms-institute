import Link from "next/link";

export default function StudentCourseNotFound() {
  return <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold text-[#071327]">Course unavailable</h1><p className="mt-3 leading-7 text-slate-700">This course is not available in your student account.</p><Link href="/student/courses" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#0b315c] px-5 py-2 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">Back to My Courses</Link></div>;
}

