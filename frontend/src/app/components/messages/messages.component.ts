import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { Message, User } from '../../models/models';

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

  private msgPollTimer: ReturnType<typeof setInterval> | null = null;
  private convPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public auth: AuthService,
    private messageService: MessageService,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadConversations();
    this.userService.getVolunteers().subscribe({
      next: (v) => { this.volunteers = v; this.cdr.markForCheck(); },
      error: () => {},
    });
    // Poll conversation list every 10s so new conversations appear automatically
    this.convPollTimer = setInterval(() => this.loadConversations(), 10_000);
  }

  ngOnDestroy() {
    if (this.msgPollTimer) clearInterval(this.msgPollTimer);
    if (this.convPollTimer) clearInterval(this.convPollTimer);
  }

  loadConversations() {
    this.messageService.getConversations().subscribe({
      next: (data) => { this.conversations = data; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  selectConversation(conv: any) {
    this.selectedConv = conv;
    this.loadMessages(conv.partner._id, true);
    // Restart message polling for the newly selected conversation
    if (this.msgPollTimer) clearInterval(this.msgPollTimer);
    this.msgPollTimer = setInterval(() => {
      if (this.selectedConv) {
        this.loadMessages(this.selectedConv.partner._id, false);
      }
    }, 3_000);
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
    this.messageService.sendMessage({ receiver_id: this.selectedConv.partner._id, content: this.newMessage }).subscribe({
      next: (msg) => {
        this.messages.push(msg);
        this.newMessage = '';
        this.sending = false;
        this.cdr.markForCheck();
        this.loadConversations();
        setTimeout(() => this.scrollBottom(), 100);
      },
      error: () => { this.sending = false; this.cdr.markForCheck(); },
    });
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