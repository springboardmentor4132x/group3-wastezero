import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { Message } from '../../models/models';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, timeout, finalize } from 'rxjs/operators';

@Component({
  selector: 'app-messages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.component.html',
})
export class MessagesComponent implements OnInit, OnDestroy {
  @ViewChild('msgEnd') msgEnd!: ElementRef;
  @ViewChild('messagesList') messagesListEl!: ElementRef;
  @ViewChild('fileInput') fileInputEl!: ElementRef;

  conversations: any[] = [];
  messages: Message[] = [];
  selectedConv: any = null;
  newMessage = '';
  loading = true;
  messagesLoading = false;
  olderLoading = false;
  hasMoreMessages = false;
  oldestCursor: string | null = null;
  sending = false;
  toast = '';
  readonly editWindowMs = 10 * 60 * 1000;
  allowedContacts: any[] = [];
  allowedContactIds = new Set<string>();
  selectedConvLocked = false;
  selectedConvLockAt: string | null = null;
  selectedConvLockReason: string | null = null;
  openByMessageId: string | null = null;
  mediaViewer: { url: string; safeUrl: SafeResourceUrl; type: 'image' | 'video' | 'file' } | null = null;
  readonly reactionOptions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  editingMessageId: string | null = null;
  editingContent = '';
  reportDialogOpen = false;
  reportSubmitting = false;
  reportMessageId: string | null = null;
  reportTargetMessage: any = null;
  reportReason = '';
  reportDetails = '';
  readonly reportReasonOptions = [
    'Harassment',
    'Spam',
    'Hate Speech',
    'Scam / Fraud',
    'Inappropriate Content',
    'Threat / Violence',
  ];

  // User search
  userSearchQuery = '';
  userSearchResults: any[] = [];
  showUserSearch = false;
  private searchSubject = new Subject<string>();

  // Media
  selectedFile: File | null = null;
  filePreview: string | null = null;
  fileType: 'image' | 'video' | 'file' | null = null;

  // Typing
  typingUser: string | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingDebounce: ReturnType<typeof setTimeout> | null = null;
  private subs: Subscription[] = [];
  private convPollTimer: ReturnType<typeof setInterval> | null = null;
  private pendingDirectUserId: string | null = null;
  private readonly sendTimeoutMs = 20000;

  constructor(
    public auth: AuthService,
    private messageService: MessageService,
    private socketService: SocketService,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadAllowedContacts();
    this.loadConversations();
    this.convPollTimer = setInterval(() => this.loadConversations(), 15_000);

    // Real-time messages
    this.subs.push(
      this.socketService.on<any>('chat:message').subscribe((msg) => {
        const senderId = typeof msg.sender_id === 'object' ? msg.sender_id._id : msg.sender_id;
        const partnerId = this.selectedConv?.partner?._id;
        if (partnerId && senderId === partnerId) {
          this.messages = [...this.messages, msg];
          this.markConversationRead(partnerId);
          this.cdr.markForCheck();
          setTimeout(() => this.scrollBottom(), 80);
        }
        this.loadConversations();
      }),
    );

    // Typing indicator
    this.subs.push(
      this.socketService.on<any>('chat:typing').subscribe((data) => {
        if (this.selectedConv?.partner?._id === data.senderId) {
          this.typingUser = data.typing ? data.senderName : null;
          if (this.typingTimeout) clearTimeout(this.typingTimeout);
          if (data.typing) this.typingTimeout = setTimeout(() => { this.typingUser = null; this.cdr.markForCheck(); }, 3000);
          this.cdr.markForCheck();
        }
      }),
    );

    this.subs.push(
      this.socketService.on<any>('chat:read').subscribe((data) => {
        const ids = new Set<string>((data?.messageIds || []).map((x: string) => String(x)));
        if (!ids.size) return;
        let touched = false;
        this.messages = this.messages.map((m: any) => {
          if (ids.has(String(m._id))) {
            touched = true;
            return { ...m, isRead: true };
          }
          return m;
        });
        if (touched) this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      this.socketService.on<any>('chat:reaction').subscribe((data) => {
        const messageId = String(data?.messageId || '');
        if (!messageId) return;
        let touched = false;
        this.messages = this.messages.map((m: any) => {
          if (String(m._id) === messageId) {
            touched = true;
            return { ...m, reactions: data?.reactions || [] };
          }
          return m;
        });
        if (touched) this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      this.socketService.on<any>('chat:message:updated').subscribe((updated) => {
        if (!updated?._id) return;
        let touched = false;
        this.messages = this.messages.map((m: any) => {
          if (String(m._id) === String(updated._id)) {
            touched = true;
            return { ...m, ...updated };
          }
          return m;
        });
        if (touched) {
          this.loadConversations();
          this.cdr.markForCheck();
        }
      }),
    );

    // User search with debounce
    this.subs.push(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(q => q.length >= 2 ? this.messageService.searchUsers(q) : []),
      ).subscribe({
        next: (results) => { this.userSearchResults = results; this.cdr.markForCheck(); },
      }),
    );

    // Handle queryParam ?user=id (from volt-pickups Contact User)
    this.subs.push(
      this.route.queryParams.subscribe(params => {
        if (params['user']) {
          this.pendingDirectUserId = params['user'];
          this.openDirectMessage(params['user']);
        }
        const messageId = params['message'];
        if (typeof messageId === 'string' && messageId.trim()) {
          this.openByMessageId = messageId;
          this.openConversationFromMessage(messageId);
        }
      }),
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    if (this.convPollTimer) clearInterval(this.convPollTimer);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.typingDebounce) clearTimeout(this.typingDebounce);
  }

  loadAllowedContacts() {
    this.messageService.getAllowedContacts().subscribe({
      next: (users) => {
        this.allowedContacts = users || [];
        this.allowedContactIds = new Set((this.allowedContacts || []).map((u: any) => u._id));
        if (this.pendingDirectUserId) {
          this.openDirectMessage(this.pendingDirectUserId);
          this.pendingDirectUserId = null;
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.allowedContacts = [];
        this.allowedContactIds = new Set<string>();
        this.cdr.markForCheck();
      },
    });
  }

  loadConversations() {
    this.messageService.getConversations().subscribe({
      next: (data) => {
        this.conversations = (data || []).filter((c: any) => c?.partner?._id && (c?.lastMessage?.content != null || c?.lastMessage?.mediaUrl != null));

        if (this.selectedConv?.partner?._id) {
          const latest = this.conversations.find(c => c.partner?._id === this.selectedConv.partner._id);
          if (latest) {
            this.selectedConv = {
              ...this.selectedConv,
              ...latest,
              partner: {
                ...(this.selectedConv?.partner || {}),
                ...(latest.partner || {}),
              },
            };
            this.selectedConvLocked = !!latest.locked;
            this.selectedConvLockAt = latest.lockAt || null;
            this.selectedConvLockReason = latest.lockReason || null;
          }
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  selectConversation(conv: any) {
    this.selectedConv = conv;
    this.selectedConvLocked = !!conv?.locked;
    this.selectedConvLockAt = conv?.lockAt || null;
    this.selectedConvLockReason = conv?.lockReason || null;
    this.typingUser = null;
    this.showUserSearch = false;
    this.messages = [];
    this.oldestCursor = null;
    this.hasMoreMessages = false;
    this.loadMessages(conv.partner._id, true, true);
  }

  openDirectMessage(userId: string) {
    // Check if already in conversations
    const existing = this.conversations.find(c => c.partner?._id === userId);
    if (existing) { this.selectConversation(existing); return; }

    const contact = this.allowedContacts.find((u: any) => u._id === userId);
    if (!contact) {
      this.pendingDirectUserId = userId;
      return;
    }

    this.pendingDirectUserId = null;
    if (contact) {
      this.selectedConv = { partner: contact, lastMessage: null, unreadCount: 0, locked: false, lockAt: null };
      this.messages = [];
      this.selectedConvLocked = false;
      this.selectedConvLockAt = null;
      this.selectedConvLockReason = null;
      this.oldestCursor = null;
      this.hasMoreMessages = false;
      this.loadMessages(contact._id, true, true);
      this.cdr.markForCheck();
    }
  }

  loadMessages(partnerId: string, scroll = true, reset = false, keepPosition?: { prevHeight: number; prevTop: number }) {
    if (reset) {
      this.messagesLoading = true;
      this.olderLoading = false;
      this.oldestCursor = null;
      this.hasMoreMessages = false;
    } else {
      this.olderLoading = true;
    }

    this.messageService.getMessages(partnerId, 40, reset ? undefined : this.oldestCursor || undefined).subscribe({
      next: (data) => {
        const chunk = data?.messages || [];
        if (reset) {
          this.messages = chunk;
        } else {
          const existing = new Set(this.messages.map((m: any) => String(m._id)));
          const older = chunk.filter((m: any) => !existing.has(String(m._id)));
          this.messages = [...older, ...this.messages];
        }

        this.selectedConvLocked = !!data?.locked;
        this.selectedConvLockAt = data?.lockAt || null;
        this.selectedConvLockReason = data?.lockReason || null;
        if (data?.partner && this.selectedConv?.partner) {
          this.selectedConv = {
            ...this.selectedConv,
            partner: {
              ...this.selectedConv.partner,
              ...data.partner,
            },
          };
        }
        this.hasMoreMessages = !!data?.hasMore;
        this.oldestCursor = data?.oldestCursor || (this.messages.length ? this.messages[0].timestamp : null);
        this.messagesLoading = false;
        this.olderLoading = false;

        this.markConversationRead(partnerId);
        this.cdr.markForCheck();

        if (keepPosition) {
          setTimeout(() => {
            const el = this.messagesListEl?.nativeElement as HTMLElement | undefined;
            if (el) {
              el.scrollTop = el.scrollHeight - keepPosition.prevHeight + keepPosition.prevTop;
            }
          }, 0);
        } else if (scroll) {
          setTimeout(() => this.scrollBottom(), 80);
        }
      },
      error: () => {
        this.messagesLoading = false;
        this.olderLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.selectedFile = input.files[0];
    const mt = this.selectedFile.type;
    this.fileType = mt.startsWith('image/') ? 'image' : mt.startsWith('video/') ? 'video' : 'file';
    if (this.fileType === 'image') {
      const reader = new FileReader();
      reader.onload = r => { this.filePreview = r.target?.result as string; this.cdr.markForCheck(); };
      reader.readAsDataURL(this.selectedFile);
    } else {
      this.filePreview = null;
    }
    this.cdr.markForCheck();
  }


  openConversationFromMessage(messageId: string) {
    if (!messageId) return;
    this.messageService.resolvePartnerFromMessage(messageId).subscribe({
      next: (res) => {
        if (res?.partnerId) {
          this.pendingDirectUserId = res.partnerId;
          this.openDirectMessage(res.partnerId);
        }
      },
      error: () => {},
    });
  }

  openMediaViewer(msg: any) {
    if (!msg?.mediaUrl) return;
    const type = msg.mediaType === 'video'
      ? 'video'
      : (this.isImage(msg.mediaUrl) ? 'image' : 'file');
    this.mediaViewer = {
      url: msg.mediaUrl,
      safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(msg.mediaUrl),
      type,
    };
    this.cdr.markForCheck();
  }

  closeMediaViewer() {
    this.mediaViewer = null;
    this.cdr.markForCheck();
  }

  isArchivedMessage(msg: any): boolean {
    return !!msg?.archived;
  }

  showArchiveDivider(index: number): boolean {
    const current = this.messages[index] as any;
    const prev = index > 0 ? (this.messages[index - 1] as any) : null;
    return !!current?.archived && !prev?.archived;
  }

  archivedReason(msg: any): string {
    return msg?.archivedReason || 'Message archived because pickup chat window has expired.';
  }

  onMessagesScroll(event: Event) {
    const el = event.target as HTMLElement;
    if (!el || this.messagesLoading || this.olderLoading || !this.hasMoreMessages || !this.selectedConv?.partner?._id) {
      return;
    }
    if (el.scrollTop > 30) return;
    const prevHeight = el.scrollHeight;
    const prevTop = el.scrollTop;
    this.loadMessages(this.selectedConv.partner._id, false, false, { prevHeight, prevTop });
  }

  markConversationRead(partnerId: string) {
    this.messageService.markConversationRead(partnerId).subscribe({ error: () => {} });
  }

  reactToMessage(msg: any, emoji: string) {
    if (!msg?._id || !emoji) return;
    this.messageService.reactToMessage(msg._id, emoji).subscribe({
      next: (res) => {
        this.messages = this.messages.map((m: any) => String(m._id) === String(msg._id)
          ? { ...m, reactions: res?.reactions || [] }
          : m);
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  groupedReactions(msg: any): Array<{ emoji: string; count: number; mine: boolean }> {
    const mineId = this.auth.currentUser?._id;
    const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
    (msg?.reactions || []).forEach((r: any) => {
      const key = String(r?.emoji || '');
      if (!key) return;
      const row = map.get(key) || { emoji: key, count: 0, mine: false };
      row.count += 1;
      const uid = typeof r?.user_id === 'object' ? r?.user_id?._id : r?.user_id;
      if (mineId && String(uid) === String(mineId)) row.mine = true;
      map.set(key, row);
    });
    return Array.from(map.values());
  }

  canModifyMessage(msg: any): boolean {
    if (!this.isMine(msg) || msg?.isDeleted) return false;
    const ts = new Date(msg?.timestamp).getTime();
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts <= this.editWindowMs;
  }

  startEditMessage(msg: any) {
    if (!this.canModifyMessage(msg)) return;
    this.editingMessageId = String(msg._id);
    this.editingContent = (msg?.content || '').toString();
    this.cdr.markForCheck();
  }

  cancelEditMessage() {
    this.editingMessageId = null;
    this.editingContent = '';
    this.cdr.markForCheck();
  }

  saveEditedMessage(msg: any) {
    const id = String(msg?._id || '');
    const content = (this.editingContent || '').trim();
    if (!id || !content) return;
    this.messageService.editMessage(id, content).subscribe({
      next: (updated) => {
        this.messages = this.messages.map((m: any) => String(m._id) === id ? { ...m, ...updated } : m);
        this.cancelEditMessage();
        this.loadConversations();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.showToast(err?.error?.message || 'Failed to edit message.');
      },
    });
  }

  deleteMessage(msg: any) {
    const id = String(msg?._id || '');
    if (!id || !this.canModifyMessage(msg)) return;
    if (!window.confirm('Delete this message?')) return;
    this.messageService.deleteMessage(id).subscribe({
      next: (updated) => {
        this.messages = this.messages.map((m: any) => String(m._id) === id ? { ...m, ...updated } : m);
        this.loadConversations();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.showToast(err?.error?.message || 'Failed to delete message.');
      },
    });
  }

  openReportDialog(msg: any) {
    if (!msg?._id) return;
    this.reportDialogOpen = true;
    this.reportMessageId = String(msg._id);
    this.reportTargetMessage = msg;
    this.reportReason = '';
    this.reportDetails = '';
    this.cdr.markForCheck();
  }

  // Backward-compatible handler for any stale template/chunk still calling reportMessage(msg).
  reportMessage(msg: any) {
    this.openReportDialog(msg);
  }

  closeReportDialog() {
    this.reportDialogOpen = false;
    this.reportSubmitting = false;
    this.reportMessageId = null;
    this.reportTargetMessage = null;
    this.reportReason = '';
    this.reportDetails = '';
    this.cdr.markForCheck();
  }

  selectReportReason(reason: string) {
    this.reportReason = reason;
    this.cdr.markForCheck();
  }

  submitReportDialog() {
    const id = this.reportMessageId;
    const reason = this.reportReason.trim();
    if (!id || !reason) {
      this.showToast('Report reason is required.');
      return;
    }

    this.reportSubmitting = true;
    this.messageService.reportMessage(id, reason, this.reportDetails.trim()).subscribe({
      next: (res) => {
        this.closeReportDialog();
        const reportRef = res?.reportId ? ` Report ID: ${res.reportId}` : '';
        this.showToast(`Message reported to admin support.${reportRef}`);
      },
      error: (err) => {
        this.reportSubmitting = false;
        this.showToast(err?.error?.message || 'Failed to report message.');
        this.cdr.markForCheck();
      },
    });
  }

  showToast(msg: string) {
    this.toast = msg;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.toast = '';
      this.cdr.markForCheck();
    }, 2800);
  }

  partnerAvatar(user: any): string | null {
    return user?.avatar || null;
  }

  formatLastSeen(lastSeen?: string | null): string {
    if (!lastSeen) return 'Last seen unavailable';
    const ts = new Date(lastSeen).getTime();
    if (Number.isNaN(ts)) return 'Last seen unavailable';
    const diff = Date.now() - ts;
    if (diff <= 2 * 60 * 1000) return 'Active now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `Last seen ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Last seen ${hrs}h ago`;
    return `Last seen ${new Date(lastSeen).toLocaleString()}`;
  }

  isOnline(user: any): boolean {
    return !!user?.online;
  }

  partnerStatus(user: any): string {
    if (this.isOnline(user)) return 'Online now';
    return this.formatLastSeen(user?.lastSeen);
  }

  clearFile() { this.selectedFile = null; this.filePreview = null; this.fileType = null; }

  send() {
    if ((!this.newMessage.trim() && !this.selectedFile) || !this.selectedConv || this.selectedConvLocked) return;

    const receiverId = this.selectedConv.partner._id;
    const rawContent = this.newMessage;
    const displayContent = rawContent.trim();
    const fileToSend = this.selectedFile;
    const optimisticId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const optimisticMessage: any = {
      _id: optimisticId,
      sender_id: this.auth.currentUser?._id || '',
      receiver_id: receiverId,
      content: displayContent || (fileToSend ? 'Sending attachment...' : ''),
      mediaUrl: null,
      mediaType: fileToSend
        ? (fileToSend.type.startsWith('image/') ? 'image' : fileToSend.type.startsWith('video/') ? 'video' : 'file')
        : null,
      isRead: false,
      timestamp: new Date().toISOString(),
      pending: true,
      failed: false,
    };

    this.sending = true;
    this.messages = [...this.messages, optimisticMessage];
    this.newMessage = '';
    this.clearFile();
    this.socketService.emit('chat:typing', { receiverId, typing: false });
    this.cdr.markForCheck();
    setTimeout(() => this.scrollBottom(), 80);

    const fd = new FormData();
    fd.append('receiver_id', receiverId);
    fd.append('content', rawContent);
    if (fileToSend) fd.append('media', fileToSend);

    this.messageService.sendMessage(fd).pipe(
      timeout(this.sendTimeoutMs),
      finalize(() => {
        this.sending = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: (msg) => {
        let replaced = false;
        this.messages = this.messages.map((m: any) => {
          if (String(m._id) === optimisticId) {
            replaced = true;
            return msg;
          }
          return m;
        });
        if (!replaced) {
          this.messages = [...this.messages, msg];
        }
        this.cdr.markForCheck();
        this.loadConversations();
        setTimeout(() => this.scrollBottom(), 80);
      },
      error: () => {
        this.messages = this.messages.map((m: any) => {
          if (String(m._id) === optimisticId) {
            return { ...m, pending: false, failed: true };
          }
          return m;
        });
        this.showToast('Message is taking too long. Syncing conversation...');
        this.loadMessages(receiverId, false, true);
        this.cdr.markForCheck();
      },
    });
  }

  onTyping() {
    if (!this.selectedConv) return;
    if (this.typingDebounce) clearTimeout(this.typingDebounce);
    this.socketService.emit('chat:typing', { receiverId: this.selectedConv.partner._id, typing: true });
    this.typingDebounce = setTimeout(() => {
      this.socketService.emit('chat:typing', { receiverId: this.selectedConv.partner._id, typing: false });
    }, 2000);
  }

  onUserSearchInput() {
    this.searchSubject.next(this.userSearchQuery);
    this.showUserSearch = this.userSearchQuery.length >= 2;
  }

  startConvWith(user: any) {
    if (!this.canStartConversation(user)) return;
    const existing = this.conversations.find(c => c.partner?._id === user._id);
    if (existing) { this.selectConversation(existing); }
    else {
      this.selectedConv = { partner: user, lastMessage: null, unreadCount: 0, locked: false, lockAt: null };
      this.messages = [];
      this.selectedConvLocked = false;
      this.selectedConvLockAt = null;
      this.selectedConvLockReason = null;
      this.oldestCursor = null;
      this.hasMoreMessages = false;
      this.loadMessages(user._id, true, true);
    }
    this.userSearchQuery = '';
    this.userSearchResults = [];
    this.showUserSearch = false;
    this.cdr.markForCheck();
  }

  canStartConversation(user: any): boolean {
    return this.allowedContactIds.has(user?._id);
  }

  lockLabel(lockAt: string | null): string {
    if (!lockAt) return 'Conversation archived and locked';
    return `Conversation archived and locked since ${new Date(lockAt).toLocaleString()}`;
  }

  isMine(msg: Message): boolean {
    const sid = typeof msg.sender_id === 'object' ? (msg.sender_id as any)._id : msg.sender_id;
    return sid === this.auth.currentUser?._id;
  }

  isPendingMessage(msg: any): boolean {
    return !!msg?.pending;
  }

  isFailedMessage(msg: any): boolean {
    return !!msg?.failed;
  }

  scrollBottom() {
    try { this.msgEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' }); } catch {}
  }

  partnerInitials(name: string): string {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  }

  isImage(url: string | null | undefined) {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) || url.includes('image');
  }

  trackById(_: number, item: any): string { return item?._id || _; }
  trackByIndex(i: number): number { return i; }
}
