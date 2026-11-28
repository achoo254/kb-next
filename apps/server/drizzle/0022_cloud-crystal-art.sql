-- The Cloud Space gets its own crystal; until now the Universe orb stood in for it. Only a Space still on the orb moves.
UPDATE "spaces" SET "art" = '/art/crystal-cloud.webp' WHERE "slug" = 'cloud' AND "art" = '/art/orb-universe.webp';
