import { Injectable } from '@angular/core';
import {BehaviorSubject} from 'rxjs';

@Injectable()
export class ModalService {

  showAccount$ = new BehaviorSubject(null);
  constructor() { }

  // Legacy modal messages accept different account payload shapes across views.
  showAccount(account: any): void {
    this.showAccount$.next(account);
  }

}
