One module per namespace, and that is the whole point of the directory.

`resources.ts` imports all five and is what the console and the counter screen
use. The public branch page imports `resources.public.ts` instead, which pulls
three. Because each namespace's JSON is behind its own module, a bundler can
drop the two the public page never renders — about 138 kB of admin and staff
copy, in three languages, off the first load of a page whose whole job is to
open quickly on mobile data outside.

That only works while `init.ts` takes its resources as an argument. If anything
in the initialisation path imports `resources.ts` directly, every surface ships
every namespace again and nothing here fails to warn you.
