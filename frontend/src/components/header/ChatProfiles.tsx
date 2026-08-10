import { useContext, useEffect } from 'react';
import { useSetRecoilState } from 'recoil';

import {
  ChainlitContext,
  useChatInteract,
  useChatSession,
  useConfig
} from '@chainlit/react-client';

import { Markdown } from '@/components/Markdown';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from '@/components/ui/hover-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import { IAttachment, attachmentsState } from '@/state/chat';

interface Props {
  navigate?: (to: string) => void;
}

export default function ChatProfiles({ navigate }: Props) {
  const apiClient = useContext(ChainlitContext);
  const { config } = useConfig();
  const { chatProfile, setChatProfile } = useChatSession();
  const { clear } = useChatInteract();
  const setAttachments = useSetRecoilState<IAttachment[]>(attachmentsState);

  // Early return check to prevent unnecessary renders and resource waste
  if (!config?.chatProfiles?.length || config.chatProfiles.length <= 1) {
    return null;
  }

  // Handle case when no profile is selected
  useEffect(() => {
    if (!chatProfile) {
      setChatProfile(config.chatProfiles[0].name);
    }
  }, [chatProfile, config.chatProfiles, setChatProfile]);

  // Handle case when selected profile becomes invalid
  useEffect(() => {
    if (chatProfile) {
      const profileExists = config.chatProfiles.some(
        (profile) => profile.name === chatProfile
      );
      if (!profileExists) {
        setChatProfile(config.chatProfiles[0].name);
      }
    }
  }, [chatProfile, config.chatProfiles, setChatProfile]);

  const startChatWithProfile = (profile: string) => {
    setChatProfile(profile);
    setAttachments([]);
    clear();
    navigate?.('/');
  };

  const allowHtml = config?.features?.unsafe_allow_html;
  const latex = config?.features?.latex;

  return (
    <div className="relative">
      <Select
        value={chatProfile || ''}
        onValueChange={(value) => {
          startChatWithProfile(value);
        }}
      >
        <SelectTrigger
          id="chat-profiles"
          className="w-fit border-none bg-transparent text-muted-foreground font-semibold text-lg hover:bg-accent"
        >
          <SelectValue placeholder="Select profile" />
        </SelectTrigger>
        <SelectContent>
          {config.chatProfiles.map((profile) => {
            const icon = profile.icon?.includes('/public')
              ? apiClient.buildEndpoint(profile.icon)
              : profile.icon;

            return (
              <HoverCard openDelay={0} closeDelay={0} key={profile.name}>
                <HoverCardTrigger asChild>
                  <SelectItem
                    data-test={`select-item:${profile.name}`}
                    value={profile.name}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {icon && (
                        <img
                          src={icon}
                          alt={profile.display_name || profile.name}
                          className="w-6 h-6 rounded-md object-cover"
                        />
                      )}
                      <span>{profile.display_name || profile.name}</span>
                    </div>
                  </SelectItem>
                </HoverCardTrigger>
                <HoverCardContent
                  side="right"
                  id="chat-profile-description"
                  align="start"
                  className="w-80 overflow-visible"
                  sideOffset={10}
                >
                  <Markdown
                    allowHtml={allowHtml}
                    latex={latex}
                    renderMarkdown={true}
                  >
                    {profile.markdown_description}
                  </Markdown>
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
