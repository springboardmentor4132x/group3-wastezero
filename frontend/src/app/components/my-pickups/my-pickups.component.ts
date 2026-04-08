import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PickupService } from '../../services/pickup.service';
import { AuthService } from '../../services/auth.service';
import { MessageService } from '../../services/message.service';
import { UploadService } from '../../services/upload.service';
import { FormsModule } from '@angular/forms';
import { Pickup } from '../../models/models';
import { finalize, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-my-pickups',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './my-pickups.component.html',
})
export class MyPickupsComponent implements OnInit {
  pickups: Pickup[] = [];
  loading = true;
  filter = 'All';
  statusFilters = ['All', 'Open', 'Accepted', 'Completed', 'Cancelled'];
  successMsg = '';
  errorMsg = '';
  msgModal: { pickup: Pickup; receiverId: string; receiverName: string } | null = null;
  msgContent = '';
  msgSending = false;
  msgError = '';
  private readonly msgSendTimeoutMs = 20000;
  completionModalPickup: Pickup | null = null;
  completionFiles: File[] = [];
  completionPreviews: string[] = [];
  completionUploading = false;

  constructor(
    public auth: AuthService,
    private pickupService: PickupService,
    private messageService: MessageService,
    private uploadService: UploadService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.pickupService.getMyPickups().subscribe({
      next: (data) => { this.pickups = data; this.loading = false; this.cdr.markForCheck(); this.cdr.markForCheck(); },
      error: () => { this.loading = false; },
    });
  }

  get filteredPickups(): Pickup[] {
    if (this.filter === 'All') return this.pickups;
    return this.pickups.filter(p => p.status === this.filter);
  }

  complete(id: string) {
    const pickup = this.pickups.find((p) => p._id === id);
    if (pickup?.requestType === 'IllegalDump' && this.auth.userRole === 'volunteer') {
      this.completionModalPickup = pickup;
      this.completionFiles = [];
      this.completionPreviews = [];
      this.cdr.markForCheck();
      return;
    }

    this.pickupService.completePickup(id).subscribe({
      next: () => { this.successMsg = 'Pickup marked as completed!'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error'; },
    });
  }

  onCompletionProofChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;

    this.completionFiles = Array.from(input.files).slice(0, 5);
    this.completionPreviews = [];
    this.completionFiles.forEach((f) => {
      if (!f.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (r) => {
        const data = r.target?.result as string;
        if (data) {
          this.completionPreviews = [...this.completionPreviews, data];
          this.cdr.markForCheck();
        }
      };
      reader.readAsDataURL(f);
    });
    this.cdr.markForCheck();
  }

  submitCompletionWithProof() {
    if (!this.completionModalPickup) return;
    if (!this.completionFiles.length) {
      this.errorMsg = 'Please upload completion proof photos.';
      this.cdr.markForCheck();
      return;
    }

    this.completionUploading = true;
    const pickup = this.completionModalPickup;
    this.uploadService.uploadMultiple(this.completionFiles, 'illegal-dumps-completion').subscribe({
      next: (results) => {
        const completionProofImages = (results || []).map((r) => r.url).filter(Boolean);
        this.pickupService.completePickup(pickup._id, { completionProofImages }).subscribe({
          next: () => {
            this.successMsg = 'Cleanup marked complete and sent for admin approval.';
            this.completionUploading = false;
            this.closeCompletionModal();
            this.load();
          },
          error: (err) => {
            this.completionUploading = false;
            this.errorMsg = err.error?.message || 'Error';
            this.cdr.markForCheck();
          },
        });
      },
      error: () => {
        this.completionUploading = false;
        this.errorMsg = 'Proof upload failed. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  closeCompletionModal() {
    this.completionModalPickup = null;
    this.completionFiles = [];
    this.completionPreviews = [];
    this.completionUploading = false;
    this.cdr.markForCheck();
  }

  cancel(id: string) {
    if (!confirm('Cancel this pickup request?')) return;
    this.pickupService.cancelPickup(id).subscribe({
      next: () => { this.successMsg = 'Pickup cancelled.'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error'; },
    });
  }

  openMsgModal(pickup: Pickup) {
    const isUser = this.auth.currentUser?.role === 'user';
    const partner = isUser ? pickup.volunteer_id : pickup.user_id;
    if (!partner || typeof partner === 'string') return;
    this.msgModal = { pickup, receiverId: (partner as any)._id, receiverName: (partner as any).name };
    this.msgContent = '';
    this.msgError = '';
    this.cdr.markForCheck();
  }

  closeMsgModal() {
    this.msgModal = null;
    this.msgContent = '';
    this.msgSending = false;
    this.msgError = '';
    this.cdr.markForCheck();
  }

  sendMessage() {
    if (!this.msgModal || !this.msgContent.trim()) return;
    this.msgSending = true;
    this.msgError = '';
    this.messageService.sendMessage({
      receiver_id: this.msgModal.receiverId,
      content: this.msgContent,
      pickup_id: this.msgModal.pickup._id,
    }).pipe(
      timeout(this.msgSendTimeoutMs),
      finalize(() => {
        this.msgSending = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: () => {
        this.successMsg = 'Message sent!';
        this.closeMsgModal();
      },
      error: (err) => {
        this.msgError = err?.error?.message || 'Unable to send message.';
        this.cdr.markForCheck();
      },
    });
  }

  getUser(p: Pickup): string { return typeof p.user_id === 'object' ? (p.user_id as any).name : ''; }
  getVolunteer(p: Pickup): string { return p.volunteer_id && typeof p.volunteer_id === 'object' ? (p.volunteer_id as any).name : 'Not assigned'; }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}