import { Link } from "wouter";
import { Home, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 text-center px-4">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-destructive" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
          <p className="text-lg font-medium text-foreground mb-1">Page not found</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Link href="/">
          <Button className="gap-2">
            <Home className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
