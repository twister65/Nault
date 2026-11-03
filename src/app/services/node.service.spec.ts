import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { NodeService } from './node.service';
import { NotificationService } from './notification.service';

describe('NodeService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [NodeService]
    });
  });

  it('should be created', inject([NodeService], (service: NodeService) => {
    expect(service).toBeTruthy();
  }));

  it('keeps background first-run failures silent while tracking offline state', inject(
    [NodeService, NotificationService], (service: NodeService, notifications: NotificationService) => {
      const sendError = spyOn(notifications, 'sendError');
      const clear = spyOn(notifications, 'removeNotification');
      service.setOffline(null);
      expect(service.node.status).toBe(false);
      expect(sendError).not.toHaveBeenCalled();
      expect(clear).toHaveBeenCalledWith('node-offline');
    }
  ));

  it('continues to warn when a configured wallet cannot reach its node', inject(
    [NodeService, NotificationService], (service: NodeService, notifications: NotificationService) => {
      const sendError = spyOn(notifications, 'sendError');
      service.setOffline();
      expect(service.node.status).toBe(false);
      expect(sendError).toHaveBeenCalledTimes(1);
    }
  ));
});
