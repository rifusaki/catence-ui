import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import SidebarTrigger from '@/components/header/SidebarTrigger';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from '@/components/ui/sidebar';

import NewChatButton from '../header/NewChat';
import SearchChats from './Search';
import { ThreadHistory } from './ThreadHistory';

export default function LeftSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Sidebar {...props} className="border-none">
      <SidebarHeader className="py-3">
        <div className="flex items-center justify-between">
          <SidebarTrigger />
          <div className="flex items-center">
            <SearchChats />
            <NewChatButton navigate={navigate} />
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.pathname === '/'}>
                  <NavLink to="/">Home</NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/dashboard'}
                >
                  <NavLink to="/dashboard">Dashboard</NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/status'}
                >
                  <NavLink to="/status">Status</NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/models'}
                >
                  <NavLink to="/models">Models</NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <ThreadHistory />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
