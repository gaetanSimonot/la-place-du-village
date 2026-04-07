export default function SkeletonCard() {
  return (
    <div className="bg-white rounded-[16px] shadow-card overflow-hidden animate-pulse">
      <div className="w-full h-32 bg-[#EDE8E0]" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-20 bg-[#EDE8E0] rounded-full" />
        <div className="h-5 w-3/4 bg-[#EDE8E0] rounded" />
        <div className="h-4 w-1/2 bg-[#EDE8E0] rounded" />
        <div className="h-3 w-2/3 bg-[#EDE8E0] rounded" />
      </div>
    </div>
  )
}

export function SkeletonList() {
  return (
    <div className="p-3 grid gap-3">
      {[1, 2, 3, 4].map(i => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
