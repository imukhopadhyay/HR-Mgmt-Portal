import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function EmployeeAvatar({
  id,
  name,
  hasPhoto,
  className,
}: {
  id: string;
  name: string;
  hasPhoto?: boolean;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Avatar className={cn("size-8", className)}>
      {hasPhoto && <AvatarImage src={`/api/employees/${id}/photo`} alt="" />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
