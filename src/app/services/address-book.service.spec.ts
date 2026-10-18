import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { AddressBookService } from './address-book.service';

describe('AddressBookService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [AddressBookService]
    });
  });

  it('should be created', inject([AddressBookService], (service: AddressBookService) => {
    expect(service).toBeTruthy();
  }));
});
