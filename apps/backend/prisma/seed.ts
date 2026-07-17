import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seeding...');

  // Clean the database
  await prisma.page.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.book.deleteMany();
  await prisma.category.deleteMany();

  console.log('Cleaned database.');

  // Create Categories
  const sciFi = await prisma.category.create({
    data: { name: 'Science Fiction' },
  });

  const fantasy = await prisma.category.create({
    data: { name: 'Fantasy' },
  });

  const classics = await prisma.category.create({
    data: { name: 'Classics' },
  });

  console.log('Created categories.');

  // Create Book 1: Dune (Sci-Fi & Classics)
  const dune = await prisma.book.create({
    data: {
      title: 'Dune',
      author: 'Frank Herbert',
      short_description: 'A mythic and emotionally charged hero’s journey.',
      full_description: 'Dune tells the story of Paul Atreides, a brilliant and gifted young man born into a great destiny beyond his understanding, who must travel to the most dangerous planet in the universe to ensure the future of his family and his people.',
      categories: {
        connect: [{ id: sciFi.id }, { id: classics.id }],
      },
    },
  });

  // Chapters for Dune
  const duneCh1 = await prisma.chapter.create({
    data: {
      book_id: dune.id,
      title: 'Chapter 1: The Gom Jabbar',
      chapter_order: 1,
    },
  });

  const duneCh2 = await prisma.chapter.create({
    data: {
      book_id: dune.id,
      title: 'Chapter 2: The Arrival on Arrakis',
      chapter_order: 2,
    },
  });

  // Pages for Dune Ch 1
  await prisma.page.create({
    data: {
      chapter_id: duneCh1.id,
      page_number: 1,
      text_content: 'In the week before they departed for Arrakis, when all the final scurrying about had reached a nearly unbearable frenzy, an old crone came to visit the mother of the boy, Paul.',
      image_urls: JSON.stringify(['https://images.unsplash.com/photo-1547234935-80c7145ec969?auto=format&fit=crop&q=80&w=800']),
    },
  });

  await prisma.page.create({
    data: {
      chapter_id: duneCh1.id,
      page_number: 2,
      text_content: 'The old woman was let in by the side door down the vaulted passage past Paul’s bedroom. She was allowed a moment to look in at him where he lay in his bed.',
      image_urls: JSON.stringify([]),
    },
  });

  // Pages for Dune Ch 2
  await prisma.page.create({
    data: {
      chapter_id: duneCh2.id,
      page_number: 1,
      text_content: 'Arrakis—planet of sand, of the desert, and of the giant sandworms. The heat was like a physical blow as they stepped off the ship.',
      image_urls: JSON.stringify(['https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&q=80&w=800']),
    },
  });

  // Create Book 2: The Hobbit (Fantasy & Classics)
  const hobbit = await prisma.book.create({
    data: {
      title: 'The Hobbit',
      author: 'J.R.R. Tolkien',
      short_description: 'Bilbo Baggins’ unexpected journey.',
      full_description: 'Written for J.R.R. Tolkien’s own children, The Hobbit met with instant critical acclaim when it was published. It is a classic of modern fantasy literature.',
      categories: {
        connect: [{ id: fantasy.id }, { id: classics.id }],
      },
    },
  });

  const hobbitCh1 = await prisma.chapter.create({
    data: {
      book_id: hobbit.id,
      title: 'Chapter 1: An Unexpected Party',
      chapter_order: 1,
    },
  });

  await prisma.page.create({
    data: {
      chapter_id: hobbitCh1.id,
      page_number: 1,
      text_content: 'In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell, nor yet a dry, bare, sandy hole with nothing in it to sit down on or to eat: it was a hobbit-hole, and that means comfort.',
      image_urls: JSON.stringify(['https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=800']),
    },
  });

  console.log('Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
