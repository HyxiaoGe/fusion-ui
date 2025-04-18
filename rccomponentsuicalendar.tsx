warning: in the working copy of 'src/components/models/ModelSelector.tsx', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/src/components/models/ModelSelector.tsx b/src/components/models/ModelSelector.tsx[m
[1mindex 0a7fc79..e3a2d00 100644[m
[1m--- a/src/components/models/ModelSelector.tsx[m
[1m+++ b/src/components/models/ModelSelector.tsx[m
[36m@@ -21,9 +21,11 @@[m [mimport {[m
   TooltipProvider,[m
   TooltipTrigger,[m
 } from "@/components/ui/tooltip";[m
[32m+[m[32mimport { Button } from "@/components/ui/button";[m
[32m+[m[32mimport { PlusCircle } from "lucide-react";[m
 [m
 interface ModelSelectorProps {[m
[31m-  onChange?: (modelId: string) => void;[m
[32m+[m[32m  onChange: (modelId: string) => void;[m
   modelId?: string;[m
   disabled?: boolean;[m
   className?: string;[m
