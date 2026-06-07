"use client";

import { CalendarDays, CheckCircle2, Clock, Mail, MapPin, Send } from "lucide-react";
import Script from "next/script";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useBranding } from "@/components/providers/BrandingProvider";

declare global {
  interface Window {
    turnstile?: {
      reset: () => void;
    };
  }
}

interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

interface PublicFormConfig {
  organization: { name: string; supportEmail: string };
  turnstileSiteKey: string | null;
  services: ServiceOption[];
  form: {
    name: string;
    introText: string | null;
    fields: Array<{ label: string; fieldKey: string; type: string; isRequired: boolean; placeholder: string | null; helpText: string | null; options: string[] }>;
  };
}

const minuteOptions = ["00", "15", "30", "45"];
const hourOptions24 = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const hourOptions12 = Array.from({ length: 12 }, (_, index) => String(index + 1));

function fieldValue(data: Record<string, string>, key: string) {
  return data[key] ?? "";
}

export function PublicEventServiceRequest() {
  const branding = useBranding();
  const [config, setConfig] = useState<PublicFormConfig | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [startHour, setStartHour] = useState("");
  const [startMinute, setStartMinute] = useState("00");
  const [startPeriod, setStartPeriod] = useState<"AM" | "PM">("AM");
  const [endHour, setEndHour] = useState("");
  const [endMinute, setEndMinute] = useState("00");
  const [endPeriod, setEndPeriod] = useState<"AM" | "PM">("AM");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requiredService = selectedServiceIds.length > 0;
  const logoUrl = branding.loginLogoUrl ?? branding.logoUrl;
  const usesTwelveHourTime = branding.timeFormat === "12h";
  const hourOptions = usesTwelveHourTime ? hourOptions12 : hourOptions24;
  const logoBackgroundStyle = {
    background: branding.brandLogoTransparentBackground ? "transparent" : (branding.brandLogoBackgroundColor ?? "#ffffff")
  };

  const customFields = useMemo(() => (config?.form.fields ?? []).filter((field) => !["eventName", "venue", "organizer", "eventDate", "additionalInfo"].includes(field.fieldKey)), [config?.form.fields]);

  useEffect(() => {
    apiFetch<PublicFormConfig>("/public/event-services/form")
      .then(setConfig)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load event request form."))
      .finally(() => setLoading(false));
  }, []);

  function updateField(key: string, value: string) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) => current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]);
  }

  function resetTurnstile() {
    window.turnstile?.reset();
  }

  function startAnotherRequest() {
    setTrackingNumber(null);
    setFormData({});
    setSelectedServiceIds([]);
    setStartHour("");
    setStartMinute("00");
    setStartPeriod("AM");
    setEndHour("");
    setEndMinute("00");
    setEndPeriod("AM");
    setError(null);
    resetTurnstile();
  }

  function toApiTime(hour: string, minute: string, period: "AM" | "PM") {
    if (!hour) {
      return undefined;
    }
    if (!usesTwelveHourTime) {
      return `${hour.padStart(2, "0")}:${minute}`;
    }
    const numericHour = Number(hour);
    const normalizedHour = period === "AM" ? (numericHour === 12 ? 0 : numericHour) : (numericHour === 12 ? 12 : numericHour + 12);
    return `${String(normalizedHour).padStart(2, "0")}:${minute}`;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!requiredService) {
      setError("Select at least one service.");
      return;
    }
    const captchaToken = String(new FormData(event.currentTarget).get("cf-turnstile-response") ?? "");
    setSubmitting(true);
    try {
      const response = await apiFetch<{ trackingNumber: string }>("/public/event-services/requests", {
        method: "POST",
        body: JSON.stringify({
          eventName: fieldValue(formData, "eventName"),
          organizer: fieldValue(formData, "organizer"),
          venue: fieldValue(formData, "venue"),
          eventDate: fieldValue(formData, "eventDate"),
          startTime: toApiTime(startHour, startMinute, startPeriod),
          endTime: toApiTime(endHour, endMinute, endPeriod),
          serviceIds: selectedServiceIds,
          additionalInfo: fieldValue(formData, "additionalInfo"),
          requesterFirstName: fieldValue(formData, "requesterFirstName"),
          requesterLastName: fieldValue(formData, "requesterLastName"),
          requesterEmail: fieldValue(formData, "requesterEmail"),
          requesterPhone: fieldValue(formData, "requesterPhone"),
          formData,
          captchaToken: captchaToken || undefined
        })
      });
      setTrackingNumber(response.trackingNumber);
    } catch (caught) {
      resetTurnstile();
      setError(caught instanceof Error ? caught.message : "Unable to submit event request.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderCustomField(field: PublicFormConfig["form"]["fields"][number]) {
    if (field.type === "TEXTAREA") {
      return <textarea className="public-event-input" required={field.isRequired} placeholder={field.placeholder ?? ""} value={fieldValue(formData, field.fieldKey)} onChange={(event) => updateField(field.fieldKey, event.target.value)} />;
    }
    if (field.type === "SELECT" || field.type === "RADIO") {
      return (
        <select className="public-event-input" required={field.isRequired} value={fieldValue(formData, field.fieldKey)} onChange={(event) => updateField(field.fieldKey, event.target.value)}>
          <option value="">Select...</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    return <input className="public-event-input" type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : field.type === "EMAIL" ? "email" : "text"} required={field.isRequired} placeholder={field.placeholder ?? ""} value={fieldValue(formData, field.fieldKey)} onChange={(event) => updateField(field.fieldKey, event.target.value)} />;
  }

  if (loading) {
    return <main className="public-event-page"><section className="public-event-form-card">Loading event request form...</section></main>;
  }

  if (trackingNumber) {
    return (
      <main className="public-event-page">
        <section className="public-event-success">
          <CheckCircle2 size={44} aria-hidden="true" />
          <h1>Request received</h1>
          <p>Your event request has been submitted. Keep this tracking number for follow-up.</p>
          <strong>{trackingNumber}</strong>
          <span>{config?.organization.supportEmail}</span>
          <button className="button" type="button" onClick={startAnotherRequest}>
            Request Another Event
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="public-event-page">
      <section className="public-event-hero">
        <div className="public-event-brand">
          {logoUrl ? <img src={logoUrl} alt="" style={logoBackgroundStyle} /> : <span>{branding.applicationName.slice(0, 1)}</span>}
        </div>
        <div>
          <p>Event & Services</p>
          <h1>Schedule Event Support</h1>
          <span>Tell us what you need and our team will coordinate the right services, technicians, and follow-up.</span>
        </div>
      </section>

      <form className="public-event-form-card" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <h2>{config?.form.name ?? "Event Scheduling Request"}</h2>
            <p className="muted">{config?.form.introText}</p>
          </div>
        </div>
        {error ? <div className="alert error">{error}</div> : null}

        <div className="public-event-grid">
          <label>Event Name *<input className="public-event-input" required value={fieldValue(formData, "eventName")} onChange={(event) => updateField("eventName", event.target.value)} /></label>
          <label>Event Address and Venue Name *<input className="public-event-input" required value={fieldValue(formData, "venue")} onChange={(event) => updateField("venue", event.target.value)} /></label>
          <label className="span-2">Organizer *<input className="public-event-input" required value={fieldValue(formData, "organizer")} onChange={(event) => updateField("organizer", event.target.value)} /></label>
          <div className="public-event-schedule-row span-2">
            <label><CalendarDays size={15} /> Date *<input className="public-event-input" type="date" required value={fieldValue(formData, "eventDate")} onChange={(event) => updateField("eventDate", event.target.value)} /></label>
            <div className="public-event-time-group">
              <span><Clock size={15} /> Start Time *</span>
              <select required value={startHour} onChange={(event) => setStartHour(event.target.value)}><option value="">HH</option>{hourOptions.map((hour) => <option key={hour} value={hour}>{hour}</option>)}</select>
              <select value={startMinute} onChange={(event) => setStartMinute(event.target.value)}>{minuteOptions.map((minute) => <option key={minute} value={minute}>{minute}</option>)}</select>
              {usesTwelveHourTime ? <select value={startPeriod} onChange={(event) => setStartPeriod(event.target.value as "AM" | "PM")}><option value="AM">AM</option><option value="PM">PM</option></select> : null}
            </div>
            <div className="public-event-time-group">
              <span><Clock size={15} /> End Time *</span>
              <select required value={endHour} onChange={(event) => setEndHour(event.target.value)}><option value="">HH</option>{hourOptions.map((hour) => <option key={hour} value={hour}>{hour}</option>)}</select>
              <select value={endMinute} onChange={(event) => setEndMinute(event.target.value)}>{minuteOptions.map((minute) => <option key={minute} value={minute}>{minute}</option>)}</select>
              {usesTwelveHourTime ? <select value={endPeriod} onChange={(event) => setEndPeriod(event.target.value as "AM" | "PM")}><option value="AM">AM</option><option value="PM">PM</option></select> : null}
            </div>
          </div>
        </div>

        <section className="public-event-services">
          <h3>Service Request *</h3>
          <div className="public-event-service-grid">
            {config?.services.map((service) => (
              <button className={`public-event-service-card${selectedServiceIds.includes(service.id) ? " selected" : ""}`} type="button" key={service.id} onClick={() => toggleService(service.id)}>
                <span>{service.name.slice(0, 1)}</span>
                <strong>{service.name}</strong>
                <small>{service.description}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="public-event-grid">
          <label>Your Name *<input className="public-event-input" required placeholder="First" value={fieldValue(formData, "requesterFirstName")} onChange={(event) => updateField("requesterFirstName", event.target.value)} /></label>
          <label>&nbsp;<input className="public-event-input" required placeholder="Last" value={fieldValue(formData, "requesterLastName")} onChange={(event) => updateField("requesterLastName", event.target.value)} /></label>
          <label><Mail size={15} /> Email *<input className="public-event-input" type="email" required value={fieldValue(formData, "requesterEmail")} onChange={(event) => updateField("requesterEmail", event.target.value)} /></label>
          <label>Phone<input className="public-event-input" value={fieldValue(formData, "requesterPhone")} onChange={(event) => updateField("requesterPhone", event.target.value)} /></label>
          <label className="span-2">Additional information<textarea className="public-event-input" value={fieldValue(formData, "additionalInfo")} onChange={(event) => updateField("additionalInfo", event.target.value)} /></label>
          {customFields.map((field) => (
            <label key={field.fieldKey}>
              {field.label}{field.isRequired ? " *" : ""}
              {renderCustomField(field)}
              {field.helpText ? <small>{field.helpText}</small> : null}
            </label>
          ))}
        </div>

        {config?.turnstileSiteKey ? (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
            <div className="cf-turnstile" data-sitekey={config.turnstileSiteKey} />
          </>
        ) : null}

        <button className="button public-event-submit" type="submit" disabled={submitting}>
          <Send size={16} aria-hidden="true" />
          <span>{submitting ? "Submitting..." : "Schedule"}</span>
        </button>
      </form>

      <footer className="public-event-footer">
        <MapPin size={16} aria-hidden="true" />
        <span>{config?.organization.name ?? "Avidity Technologies"} - {config?.organization.supportEmail}</span>
      </footer>
    </main>
  );
}
