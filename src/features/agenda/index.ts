/** API pública da funcionalidade de agenda. */
export { appointmentsStore } from "../../lib/store/appointments";
export { TIME_BLOCK_MARKER, isTimeBlock } from "../../lib/store/types";
export type { Appointment, AppointmentService } from "../../lib/store/types";
export { fetchAllData } from "../../lib/store/bootstrap";
