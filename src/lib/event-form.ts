/** Shapes shared by the event form component and the event server actions. */

export type EventFormValues = {
  title: string;
  description: string;
  venue: string;
  /** datetime-local value, "YYYY-MM-DDTHH:mm" */
  start_at: string;
  end_at: string;
  registration_deadline: string;
  capacity: string;
  banner_url: string;
};

export type EventFieldName = Exclude<keyof EventFormValues, "banner_url">;

export type EventFormState = {
  /** Form-level error not tied to one field. */
  error: string | null;
  fieldErrors: Partial<Record<EventFieldName, string>>;
  /** What the user submitted, so the form can keep it after an error. */
  values: EventFormValues;
  /** True after a successful save that stays on the page (editing). */
  saved: boolean;
};

export const emptyEventValues: EventFormValues = {
  title: "",
  description: "",
  venue: "",
  start_at: "",
  end_at: "",
  registration_deadline: "",
  capacity: "",
  banner_url: "",
};
