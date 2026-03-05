import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { SocketService } from '../../services/socket.service';
import { Message, User } from '../../models/models';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-messages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.component.html',
})
export class MessagesComponent implements OnInit, OnDestroy {
  @ViewChild('msgEnd') msgEnd!: ElementRef;

  conversations: any[] = [];
  messages: Message[] = [];
  selectedConv: any = null;
  newMessage = '';
  loading = true;
  sending = false;
  volunteers: User[] = [];
  newConvUserId = '';
  showNewConv = false;

  // Typing indicator
  typingUser: string | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingDebounce: ReturnType<typeof setTimeout> | null = null;

  private subs: Subscription[] = [];
  private convPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public auth: AuthService,
    private messageService: MessageService,
    private userService: UserService,
    private socketService: SocketService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadConversations();
    this.userService.getVolunteers().subscribe({
      next: (v) => { this.volunteers = v; this.cdr.markForCheck(); },
      error: () => {},
    });
    // Poll conversation list every 15s as fallback
    this.convPollTimer = setInterval(() => this.loadConversations(), 15_000);

    // Real-time: listen for incoming messages
    this.subs.push(
      this.socketService.on<any>('chat:message').subscribe((msg) => {
        const senderId = typeof msg.sender_id === 'object' ? msg.sender_id._id : msg.sender_id;
        const partnerId = this.selectedConv?.partner?._id;
        if (partnerId && senderId === partnerId) {
          // Message is from the current conversation partner — add to view
          this.messages = [...this.messages, msg];
          this.cdr.markForCheck();
          setTimeout(() => this.scrollBottom(), 100);
        }
        // Refresh conversation list to update last message / unread
        this.loadConversations();
      }),
    );

    // Real-time: typing indicator
    this.subs.push(
      this.socketService.on<any>('chat:typing').subscribe((data) => {
        if (this.selectedConv?.partner?._id === data.senderId && data.typing) {
          this.typingUser = data.senderName;
          this.cdr.markForCheck();
          // Clear after 3s
          if (this.typingTimeout) clearTimeout(this.typingTimeout);
          this.typingTimeout = setTimeout(() => {
            this.typingUser = null;
            this.cdr.markForCheck();
          }, 3000);
        } else if (data.senderId === this.selectedConv?.partner?._id && !data.typing) {
          this.typingUser = null;
          this.cdr.markForCheck();
        }
      }),
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    if (this.convPollTimer) clearInterval(this.convPollTimer);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.typingDebounce) clearTimeout(this.typingDebounce);
  }

  loadConversations() {
    this.messageService.getConversations().subscribe({
      next: (data) => {
        // Filter out entries with missing partner or lastMessage to prevent template crashes
        this.conversations = (data || []).filter(
          (c: any) => c?.partner?._id && c?.lastMessage?.content != null
        );
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  selectConversation(conv: any) {
    this.selectedConv = conv;
    this.typingUser = null;
    this.loadMessages(conv.partner._id, true);
  }

  loadMessages(partnerId: string, scroll = true) {
    this.messageService.getMessages(partnerId).subscribe({
      next: (data) => {
        this.messages = data;
        this.cdr.markForCheck();
        if (scroll) setTimeout(() => this.scrollBottom(), 100);
      },
      error: () => {},
    });
  }

  send() {
    if (!this.newMessage.trim() || !this.selectedConv) return;
    this.sending = true;
    // Stop typing indicator
    this.socketService.emit('chat:typing', { receiverId: this.selectedConv.partner._id, typing: false });
    this.messageService.sendMessage({ receiver_id: this.selectedConv.partner._id, content: this.newMessage }).subscribe({
      next: (msg) => {
        this.messages = [...this.messages, msg];
        this.newMessage = '';
        this.sending = false;
        this.cdr.markForCheck();
        this.loadConversations();
        setTimeout(() => this.scrollBottom(), 100);
      },
      error: () => { this.sending = false; this.cdr.markForCheck(); },
    });
  }

  /** Emit typing event (debounced) */
  onTyping() {
    if (!this.selectedConv) return;
    if (this.typingDebounce) clearTimeout(this.typingDebounce);
    this.socketService.emit('chat:typing', { receiverId: this.selectedConv.partner._id, typing: true });
    this.typingDebounce = setTimeout(() => {
      this.socketService.emit('chat:typing', { receiverId: this.selectedConv.partner._id, typing: false });
    }, 2000);
  }

  sendNewConv() {
    if (!this.newConvUserId || !this.newMessage.trim()) return;
    this.sending = true;
    this.messageService.sendMessage({ receiver_id: this.newConvUserId, content: this.newMessage }).subscribe({
      next: () => {
        this.newMessage = '';
        this.sending = false;
        this.showNewConv = false;
        this.cdr.markForCheck();
        this.loadConversations();
      },
      error: () => { this.sending = false; this.cdr.markForCheck(); },
    });
  }

  isMine(msg: Message): boolean {
    const sid = typeof msg.sender_id === 'object' ? (msg.sender_id as any)._id : msg.sender_id;
    return sid === this.auth.currentUser?._id;
  }

  scrollBottom() {
    try { this.msgEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' }); } catch {}
  }

  get myInitials(): string {
    return this.auth.currentUser?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }

  partnerInitials(name: string): string {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}