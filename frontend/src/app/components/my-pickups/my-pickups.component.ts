import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PickupService } from '../../services/pickup.service';
import { AuthService } from '../../services/auth.service';
import { MessageService } from '../../services/message.service';
import { FormsModule } from '@angular/forms';
import { Pickup } from '../../models/models';

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

  constructor(
    public auth: AuthService,
    private pickupService: PickupService,
    private messageService: MessageService,
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
    this.pickupService.completePickup(id).subscribe({
      next: () => { this.successMsg = 'Pickup marked as completed!'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error'; },
    });
  }

  accept(id: string) {
    this.pickupService.acceptPickup(id).subscribe({
      next: () => { this.successMsg = 'Pickup accepted successfully!'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error accepting pickup'; },
    });
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
  }

  sendMessage() {
    if (!this.msgModal || !this.msgContent.trim()) return;
    this.msgSending = true;
    this.messageService.sendMessage({
      receiver_id: this.msgModal.receiverId,
      content: this.msgContent,
      pickup_id: this.msgModal.pickup._id,
    }).subscribe({
      next: () => { this.msgSending = false; this.msgModal = null; this.successMsg = 'Message sent!'; },
      error: () => { this.msgSending = false; },
    });
  }

  getUser(p: Pickup): string { return typeof p.user_id === 'object' ? (p.user_id as any).name : ''; }
  getVolunteer(p: Pickup): string { return p.volunteer_id && typeof p.volunteer_id === 'object' ? (p.volunteer_id as any).name : 'Not assigned'; }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}