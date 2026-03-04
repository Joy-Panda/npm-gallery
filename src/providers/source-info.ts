import { getServices } from '../services';
import type { SourceInfoMessage } from '../types/messages';

export async function buildSourceInfoMessage(): Promise<SourceInfoMessage> {
  const services = getServices();
  return services.sourceContext.buildSourceInfoMessage();
}
