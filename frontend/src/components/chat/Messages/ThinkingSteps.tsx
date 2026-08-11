import { PropsWithChildren, useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

interface Props {
  count: number;
}

/** Keep verbose execution traces available without displacing the answer. */
export default function ThinkingSteps({
  count,
  children
}: PropsWithChildren<Props>) {
  const [openValue, setOpenValue] = useState('');
  const label = 'Thinking...';

  return (
    <div className="thinking-steps my-1 max-w-full text-xs">
      <Accordion
        type="single"
        collapsible
        value={openValue}
        onValueChange={setOpenValue}
      >
        <AccordionItem value="thinking" className="border-none">
          <AccordionTrigger
            aria-label={`Show ${count} thinking step${count === 1 ? '' : 's'}`}
            className="w-fit flex-none gap-1 py-0 text-xs font-medium text-muted-foreground hover:text-foreground hover:no-underline"
          >
            {label}
          </AccordionTrigger>
          <AccordionContent className="pb-0 pt-1 text-xs">
            <div className="pl-1">{children}</div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
