alter table public.profiles enable row level security;
alter table public.sources enable row level security;
alter table public.source_contents enable row level security;
alter table public.source_chunks enable row level security;
alter table public.flashcard_sets enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.flashcard_progress enable row level security;
alter table public.sections enable row level security;
alter table public.section_study_days enable row level security;
alter table public.concept_maps enable row level security;
alter table public.concept_map_nodes enable row level security;
alter table public.concept_map_edges enable row level security;
alter table public.notebook_sessions enable row level security;
alter table public.notebook_session_sources enable row level security;
alter table public.notebook_outputs enable row level security;
alter table public.notebook_citations enable row level security;
alter table public.presentations enable row level security;
alter table public.presentation_sources enable row level security;
alter table public.presentation_slides enable row level security;
alter table public.presentation_references enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;
alter table public.academic_terms enable row level security;
alter table public.grades enable row level security;
alter table public.grade_simulations enable row level security;
alter table public.academic_ai_outputs enable row level security;
alter table public.tasks enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.tutor_conversations enable row level security;
alter table public.tutor_messages enable row level security;
alter table public.teacher_classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.class_materials enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.teacher_announcements enable row level security;
alter table public.teacher_grades enable row level security;
alter table public.teacher_generated_quizzes enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists sources_owner on public.sources;
create policy sources_owner on public.sources
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists source_contents_owner on public.source_contents;
create policy source_contents_owner on public.source_contents
for all using (exists (
  select 1 from public.sources s where s.id = source_contents.source_id and s.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.sources s where s.id = source_contents.source_id and s.owner_id = auth.uid()
));

drop policy if exists source_chunks_owner on public.source_chunks;
create policy source_chunks_owner on public.source_chunks
for all using (exists (
  select 1 from public.sources s where s.id = source_chunks.source_id and s.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.sources s where s.id = source_chunks.source_id and s.owner_id = auth.uid()
));

drop policy if exists flashcard_sets_owner on public.flashcard_sets;
create policy flashcard_sets_owner on public.flashcard_sets
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists flashcards_owner on public.flashcards;
create policy flashcards_owner on public.flashcards
for all using (exists (
  select 1 from public.flashcard_sets fs where fs.id = flashcards.set_id and fs.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.flashcard_sets fs where fs.id = flashcards.set_id and fs.owner_id = auth.uid()
));

drop policy if exists flashcard_reviews_owner on public.flashcard_reviews;
create policy flashcard_reviews_owner on public.flashcard_reviews
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists flashcard_progress_owner on public.flashcard_progress;
create policy flashcard_progress_owner on public.flashcard_progress
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sections_owner on public.sections;
create policy sections_owner on public.sections
for all using (exists (
  select 1 from public.sources s where s.id = sections.source_id and s.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.sources s where s.id = sections.source_id and s.owner_id = auth.uid()
));

drop policy if exists section_days_owner on public.section_study_days;
create policy section_days_owner on public.section_study_days
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists concept_maps_owner on public.concept_maps;
create policy concept_maps_owner on public.concept_maps
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists concept_nodes_owner on public.concept_map_nodes;
create policy concept_nodes_owner on public.concept_map_nodes
for all using (exists (
  select 1 from public.concept_maps cm where cm.id = concept_map_nodes.map_id and cm.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.concept_maps cm where cm.id = concept_map_nodes.map_id and cm.owner_id = auth.uid()
));

drop policy if exists concept_edges_owner on public.concept_map_edges;
create policy concept_edges_owner on public.concept_map_edges
for all using (exists (
  select 1 from public.concept_maps cm where cm.id = concept_map_edges.map_id and cm.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.concept_maps cm where cm.id = concept_map_edges.map_id and cm.owner_id = auth.uid()
));

drop policy if exists notebook_sessions_owner on public.notebook_sessions;
create policy notebook_sessions_owner on public.notebook_sessions
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists notebook_session_sources_owner on public.notebook_session_sources;
create policy notebook_session_sources_owner on public.notebook_session_sources
for all using (exists (
  select 1 from public.notebook_sessions ns where ns.id = notebook_session_sources.session_id and ns.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.notebook_sessions ns where ns.id = notebook_session_sources.session_id and ns.owner_id = auth.uid()
));

drop policy if exists notebook_outputs_owner on public.notebook_outputs;
create policy notebook_outputs_owner on public.notebook_outputs
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists notebook_citations_owner on public.notebook_citations;
create policy notebook_citations_owner on public.notebook_citations
for all using (exists (
  select 1 from public.notebook_outputs no where no.id = notebook_citations.output_id and no.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.notebook_outputs no where no.id = notebook_citations.output_id and no.owner_id = auth.uid()
));

drop policy if exists presentations_owner on public.presentations;
create policy presentations_owner on public.presentations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists presentation_sources_owner on public.presentation_sources;
create policy presentation_sources_owner on public.presentation_sources
for all using (exists (
  select 1 from public.presentations p where p.id = presentation_sources.presentation_id and p.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.presentations p where p.id = presentation_sources.presentation_id and p.owner_id = auth.uid()
));

drop policy if exists presentation_slides_owner on public.presentation_slides;
create policy presentation_slides_owner on public.presentation_slides
for all using (exists (
  select 1 from public.presentations p where p.id = presentation_slides.presentation_id and p.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.presentations p where p.id = presentation_slides.presentation_id and p.owner_id = auth.uid()
));

drop policy if exists presentation_refs_owner on public.presentation_references;
create policy presentation_refs_owner on public.presentation_references
for all using (exists (
  select 1 from public.presentations p where p.id = presentation_references.presentation_id and p.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.presentations p where p.id = presentation_references.presentation_id and p.owner_id = auth.uid()
));

drop policy if exists quizzes_owner on public.quizzes;
create policy quizzes_owner on public.quizzes
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists quiz_questions_owner on public.quiz_questions;
create policy quiz_questions_owner on public.quiz_questions
for all using (exists (
  select 1 from public.quizzes q where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.quizzes q where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
));

drop policy if exists quiz_attempts_owner on public.quiz_attempts;
create policy quiz_attempts_owner on public.quiz_attempts
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists quiz_attempt_answers_owner on public.quiz_attempt_answers;
create policy quiz_attempt_answers_owner on public.quiz_attempt_answers
for all using (exists (
  select 1 from public.quiz_attempts qa where qa.id = quiz_attempt_answers.attempt_id and qa.user_id = auth.uid()
)) with check (exists (
  select 1 from public.quiz_attempts qa where qa.id = quiz_attempt_answers.attempt_id and qa.user_id = auth.uid()
));

drop policy if exists terms_owner on public.academic_terms;
create policy terms_owner on public.academic_terms
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists grades_owner on public.grades;
create policy grades_owner on public.grades
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists sims_owner on public.grade_simulations;
create policy sims_owner on public.grade_simulations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists academic_ai_owner on public.academic_ai_outputs;
create policy academic_ai_owner on public.academic_ai_outputs
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists tasks_owner on public.tasks;
create policy tasks_owner on public.tasks
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_rooms_member on public.chat_rooms;
create policy chat_rooms_member on public.chat_rooms
for select using (
  owner_id = auth.uid()
  or exists (select 1 from public.chat_members cm where cm.room_id = chat_rooms.id and cm.user_id = auth.uid())
);
drop policy if exists chat_rooms_owner_write on public.chat_rooms;
create policy chat_rooms_owner_write on public.chat_rooms
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_members_room_member on public.chat_members;
create policy chat_members_room_member on public.chat_members
for select using (
  exists (select 1 from public.chat_members me where me.room_id = chat_members.room_id and me.user_id = auth.uid())
);
drop policy if exists chat_members_room_owner_write on public.chat_members;
create policy chat_members_room_owner_write on public.chat_members
for all using (
  exists (select 1 from public.chat_rooms cr where cr.id = chat_members.room_id and cr.owner_id = auth.uid())
) with check (
  exists (select 1 from public.chat_rooms cr where cr.id = chat_members.room_id and cr.owner_id = auth.uid())
);

drop policy if exists chat_messages_room_member on public.chat_messages;
create policy chat_messages_room_member on public.chat_messages
for select using (
  exists (select 1 from public.chat_members cm where cm.room_id = chat_messages.room_id and cm.user_id = auth.uid())
);
drop policy if exists chat_messages_sender_insert on public.chat_messages;
create policy chat_messages_sender_insert on public.chat_messages
for insert with check (
  sender_id = auth.uid()
  and exists (select 1 from public.chat_members cm where cm.room_id = chat_messages.room_id and cm.user_id = auth.uid())
);

drop policy if exists tutor_conversations_owner on public.tutor_conversations;
create policy tutor_conversations_owner on public.tutor_conversations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists tutor_messages_owner on public.tutor_messages;
create policy tutor_messages_owner on public.tutor_messages
for all using (exists (
  select 1 from public.tutor_conversations tc where tc.id = tutor_messages.conversation_id and tc.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.tutor_conversations tc where tc.id = tutor_messages.conversation_id and tc.owner_id = auth.uid()
));

drop policy if exists teacher_classes_owner on public.teacher_classes;
create policy teacher_classes_owner on public.teacher_classes
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists class_enrollments_visible on public.class_enrollments;
create policy class_enrollments_visible on public.class_enrollments
for select using (
  student_id = auth.uid()
  or exists (
    select 1 from public.teacher_classes tc where tc.id = class_enrollments.class_id and tc.teacher_id = auth.uid()
  )
);
drop policy if exists class_enrollments_teacher_write on public.class_enrollments;
create policy class_enrollments_teacher_write on public.class_enrollments
for all using (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_enrollments.class_id and tc.teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_enrollments.class_id and tc.teacher_id = auth.uid()
  )
);

drop policy if exists class_materials_access on public.class_materials;
create policy class_materials_access on public.class_materials
for select using (
  exists (
    select 1
    from public.teacher_classes tc
    left join public.class_enrollments ce on ce.class_id = tc.id and ce.student_id = auth.uid()
    where tc.id = class_materials.class_id and (tc.teacher_id = auth.uid() or ce.student_id is not null)
  )
);
drop policy if exists class_materials_teacher_write on public.class_materials;
create policy class_materials_teacher_write on public.class_materials
for all using (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_materials.class_id and tc.teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_materials.class_id and tc.teacher_id = auth.uid()
  )
);

drop policy if exists teacher_assignments_access on public.teacher_assignments;
create policy teacher_assignments_access on public.teacher_assignments
for select using (
  teacher_id = auth.uid()
  or exists (
    select 1 from public.class_enrollments ce where ce.class_id = teacher_assignments.class_id and ce.student_id = auth.uid()
  )
);
drop policy if exists teacher_assignments_teacher_write on public.teacher_assignments;
create policy teacher_assignments_teacher_write on public.teacher_assignments
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists assignment_submissions_access on public.assignment_submissions;
create policy assignment_submissions_access on public.assignment_submissions
for select using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.teacher_assignments ta
    where ta.id = assignment_submissions.assignment_id and ta.teacher_id = auth.uid()
  )
);
drop policy if exists assignment_submissions_student_insert on public.assignment_submissions;
create policy assignment_submissions_student_insert on public.assignment_submissions
for insert with check (student_id = auth.uid());
drop policy if exists assignment_submissions_teacher_update on public.assignment_submissions;
create policy assignment_submissions_teacher_update on public.assignment_submissions
for update using (
  exists (
    select 1 from public.teacher_assignments ta where ta.id = assignment_submissions.assignment_id and ta.teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.teacher_assignments ta where ta.id = assignment_submissions.assignment_id and ta.teacher_id = auth.uid()
  )
);

drop policy if exists teacher_announcements_access on public.teacher_announcements;
create policy teacher_announcements_access on public.teacher_announcements
for select using (
  teacher_id = auth.uid()
  or exists (
    select 1 from public.class_enrollments ce where ce.class_id = teacher_announcements.class_id and ce.student_id = auth.uid()
  )
);
drop policy if exists teacher_announcements_teacher_write on public.teacher_announcements;
create policy teacher_announcements_teacher_write on public.teacher_announcements
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists teacher_grades_access on public.teacher_grades;
create policy teacher_grades_access on public.teacher_grades
for select using (
  teacher_id = auth.uid() or student_id = auth.uid()
);
drop policy if exists teacher_grades_teacher_write on public.teacher_grades;
create policy teacher_grades_teacher_write on public.teacher_grades
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists teacher_generated_quizzes_access on public.teacher_generated_quizzes;
create policy teacher_generated_quizzes_access on public.teacher_generated_quizzes
for select using (
  teacher_id = auth.uid()
  or exists (
    select 1 from public.class_enrollments ce where ce.class_id = teacher_generated_quizzes.class_id and ce.student_id = auth.uid()
  )
);
drop policy if exists teacher_generated_quizzes_teacher_write on public.teacher_generated_quizzes;
create policy teacher_generated_quizzes_teacher_write on public.teacher_generated_quizzes
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('sources-private', 'sources-private', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('presentation-assets', 'presentation-assets', false)
on conflict (id) do nothing;

drop policy if exists sources_private_select on storage.objects;
create policy sources_private_select on storage.objects
for select to authenticated
using (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists sources_private_insert on storage.objects;
create policy sources_private_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists sources_private_update on storage.objects;
create policy sources_private_update on storage.objects
for update to authenticated
using (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists sources_private_delete on storage.objects;
create policy sources_private_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
);
