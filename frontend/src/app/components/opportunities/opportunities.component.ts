import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PickupService } from '../../services/pickup.service';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';
import { Pickup } from '../../models/models';

@Component({
  selector: 'app-opportunities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './opportunities.component.html',
})
export class OpportunitiesComponent implements OnInit {
  pickups: Pickup[] = [];
  loading = true;
  successMsg = '';
  errorMsg = '';
  filterType = '';
  filterLocation = '';
  wasteTypes = ['', 'Plastic', 'Organic', 'E-Waste', 'Metal', 'Paper', 'Glass', 'Other'];
  selectedPickup: Pickup | null = null;
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
    this.pickupService.getOpportunities().subscribe({
      next: (data) => {
        // Backend returns paginated { pickups, total } — extract the array
        this.pickups = data.pickups ?? data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  get filtered(): Pickup[] {
    return this.pickups.filter(p => {
      const typeOk = !this.filterType || p.wasteType === this.filterType;
      const locOk = !this.filterLocation || p.address.toLowerCase().includes(this.filterLocation.toLowerCase());
      return typeOk && locOk;
    });
  }

  accept(id: string) {
    this.errorMsg = '';
    this.pickupService.acceptPickup(id).subscribe({
      next: () => { this.successMsg = 'Pickup accepted! Check My Pickups.'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error accepting pickup'; },
    });
  }

  openDetail(p: Pickup) { this.selectedPickup = p; }
  closeDetail() { this.selectedPickup = null; }

  openMsg(pickup: Pickup) {
    const user = pickup.user_id;
    if (!user || typeof user === 'string') return;
    this.msgModal = { pickup, receiverId: (user as any)._id, receiverName: (user as any).name };
    this.msgContent = '';
  }

  sendMessage() {
    if (!this.msgModal || !this.msgContent.trim()) return;
    this.msgSending = true;
    this.messageService.sendMessage({ receiver_id: this.msgModal.receiverId, content: this.msgContent, pickup_id: this.msgModal.pickup._id }).subscribe({
      next: () => { this.msgSending = false; this.msgModal = null; this.successMsg = 'Message sent!'; },
      error: () => { this.msgSending = false; },
    });
  }

  getUser(p: Pickup): any { return typeof p.user_id === 'object' ? p.user_id : null; }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}