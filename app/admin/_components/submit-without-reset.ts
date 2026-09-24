import { startTransition, type FormEvent } from "react";

// onSubmit handler for the admin product/category forms: runs the same
// useActionState action a <form action={formAction}> would, but without
// React's automatic form reset afterwards.
//
// React resets a form submitted through its `action` prop once the action
// finishes — even when it returns validation errors — which wiped every
// uncontrolled field the admin had filled in. Making the fields controlled
// does not fix it for <select> or checkboxes: the DOM reset still reverts
// them to their initial selection while React state keeps the attempted
// value, so the screen and the next submission disagree. Skipping the reset
// keeps exactly what the admin entered, and the FormData is built from the
// form as the browser would, so the server receives the same fields.
//
// The form keeps its `action` prop, so a submission before hydration still
// works natively. A successful save redirects away as before.
export function submitWithoutReset(formAction: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(
      event.currentTarget,
      (event.nativeEvent as SubmitEvent).submitter,
    );
    startTransition(() => formAction(formData));
  };
}
